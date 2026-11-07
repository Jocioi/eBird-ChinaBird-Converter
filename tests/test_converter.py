"""Synthetic fixtures only. Never reads personal observation files."""
import contextlib
import csv
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from openpyxl import load_workbook
import ebird_converter as app


class ConverterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.header = ["鸟种", "数量", "观察日期", "地点"]
        self.row = ["金斑鸻 Pacific Golden-Plover", "3", "2026-11-07", "测试地点"]

    def fixture(self, rows=None, header=None, delimiter=",", bom=False, name="input.csv"):
        path = self.root / name
        with path.open("w", encoding="utf-8-sig" if bom else "utf-8", newline="") as stream:
            writer = csv.writer(stream, delimiter=delimiter)
            writer.writerow(self.header if header is None else header)
            writer.writerows([self.row] if rows is None else rows)
        return path

    def test_delimiters_bom_and_output(self):
        for delimiter in (",", "\t", ";"):
            for bom in (False, True):
                with self.subTest(delimiter=delimiter, bom=bom):
                    path = self.fixture(delimiter=delimiter, bom=bom)
                    result = app.convert_one(path, self.root / "output")
                    wb = load_workbook(result)
                    self.assertEqual(list(wb.active.values), [("中文名", "数量"), ("金鸻", 3)])
                    self.assertEqual(wb.active["A2"].data_type, "s")
                    wb.close()

    def test_dates(self):
        for text in ("2024-02-29", "2024/02/29", "2024.02.29 12:30:00"):
            self.assertEqual(app.parse_date(text), "20240229")
        for text in ("", "2025-02-29", "2026-13-01", "11/07/2026", "garbage 2026-11-07", "2026-11-07 garbage"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                app.parse_date(text)

    def test_headers_rows(self):
        for header, rows in [([], []), (["鸟种", "鸟种", "观察日期", "地点"], [self.row]),
                             (["鸟种", "", "观察日期", "地点"], [self.row]),
                             (["Common Name", "数量", "观察日期", "地点"], [self.row]),
                             (self.header, [self.row[:-1]]), (self.header, [self.row + ["extra"]]),
                             (self.header, [])]:
            with self.subTest(header=header, rows=rows), self.assertRaises(ValueError):
                app.read_records(self.fixture(header=header, rows=rows))
        path = self.root / "bad.csv"
        path.write_text('鸟种,数量,观察日期,地点\n"unterminated', encoding="utf-8")
        with self.assertRaises(csv.Error):
            app.read_records(path)

    def test_name_mapping_is_exact(self):
        self.assertEqual(app.clean_name("金斑鸻（注释）"), "金鸻")
        self.assertEqual(app.clean_name("测试金斑鸻"), "测试金斑鸻")
        for text in ("Pacific Golden-Plover", "=HYPERLINK(中文)", "金斑鸻/灰斑鸻", ""):
            with self.assertRaises(ValueError):
                app.clean_name(text)

    def test_unknown_and_bad_counts(self):
        for value in ("X", "x", ""):
            row = self.row.copy()
            row[1] = value
            data = app.read_records(self.fixture(rows=[row]))
            self.assertIsNone(data[0][0][1])
            self.assertEqual(data[-1], 1)
        for value in ("-1", "0", "1.5", "=1+2", "+2", "1,000", "1000000000000000"):
            row = self.row.copy()
            row[1] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                app.read_records(self.fixture(rows=[row]))

    def test_mixed_or_duplicate_records(self):
        for index, value in ((2, "2026-11-08"), (3, "另一测试地点"), (0, "金鸻")):
            row = self.row.copy()
            row[index] = value
            with self.assertRaises(ValueError):
                app.read_records(self.fixture(rows=[self.row, row]))
        with self.assertRaises(ValueError):
            app.read_records(self.fixture(header=self.header + ["Submission ID"],
                                          rows=[self.row + ["S1"], ["灰斑鸻", "2", "2026-11-07", "测试地点", "S2"]]))

    def test_start_time_grouping(self):
        header = self.header + ["开始时间"]
        first = self.row + ["08:00"]
        second = ["灰斑鸻", "2", "2026-11-07", "测试地点", "09:00"]
        with self.assertRaises(ValueError):
            app.read_records(self.fixture(header=header, rows=[first, second]))
        second[-1] = "08:00"
        self.assertEqual(len(app.read_records(self.fixture(header=header, rows=[first, second]))[0]), 2)

    def test_long_unicode_filename(self):
        row = self.row.copy()
        row[3] = "测试地点" * 40
        path = self.fixture(rows=[row])
        first = app.convert_one(path, self.root)
        second = app.convert_one(path, self.root)
        self.assertLessEqual(len(first.name.encode("utf-8")), 255)
        self.assertLessEqual(len(second.name.encode("utf-8")), 255)
        self.assertNotEqual(first, second)
        self.assertTrue(first.exists() and second.exists())

    def test_missing_location_species_and_filtered_rows(self):
        for index in (0, 3):
            row = self.row.copy()
            row[index] = ""
            with self.assertRaises(ValueError):
                app.read_records(self.fixture(rows=[row]))
        row = self.row.copy()
        row[0] = "未识别鸟种"
        result = app.read_records(self.fixture(rows=[self.row, row]))
        self.assertEqual(result[-2], 1)
        self.assertEqual(len(result[0]), 1)

    def test_optional_count_and_quoted_fields(self):
        result = app.read_records(self.fixture(header=["鸟种", "观察日期", "地点"],
                                               rows=[["金斑鸻", "2026-11-07", '测试,地点"甲']]))
        self.assertFalse(result[3])
        self.assertEqual(result[2], '测试,地点"甲')

    def test_nonoverwrite_and_cleanup(self):
        path = self.fixture()
        first = app.convert_one(path, self.root)
        original = first.read_bytes()
        second = app.convert_one(path, self.root)
        self.assertNotEqual(first, second)
        self.assertEqual(first.read_bytes(), original)
        with patch.object(app, "write_xlsx", side_effect=OSError("synthetic disk error")):
            with self.assertRaises(OSError):
                app.convert_one(path, self.root)
        self.assertEqual(len(list(self.root.glob("*.xlsx"))), 2)

    def test_cli_status_and_tsv_discovery(self):
        old = Path.cwd()
        os.chdir(self.root)
        self.addCleanup(os.chdir, old)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(app.main([]), 1)
            valid = self.fixture(name="input.TSV", delimiter="\t")
            self.assertEqual(app.main([]), 0)
            bad = self.fixture(name="bad.csv", rows=[self.row[:-1]])
            self.assertEqual(app.main([str(valid), str(bad)]), 1)
            self.assertEqual(app.main([str(self.root / "absent.csv")]), 1)

    def test_formula_defense_in_writer(self):
        path = self.root / "safe.xlsx"
        app.write_xlsx([("=HYPERLINK(\"https://invalid\")", None)], path, True)
        wb = load_workbook(path)
        self.assertEqual(wb.active["A2"].data_type, "s")
        wb.close()


if __name__ == "__main__":
    unittest.main()
