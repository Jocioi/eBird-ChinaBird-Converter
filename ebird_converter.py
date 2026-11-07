#!/usr/bin/env python3
"""Local Chinese eBird CSV/TSV to birdreport-style XLSX converter."""
import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

VERSION = "1.5.1"
CUSTOM_NAME_MAP = {
    "金斑鸻": "金鸻", "灰斑鸻": "灰鸻", "白冠燕尾": "白额燕尾",
    "须浮鸥": "灰翅浮鸥", "理氏鹨": "田鹨", "蒙古银鸥": "西伯利亚银鸥",
    "西方灰伯劳": "西灰伯劳", "西方毛脚燕": "毛脚燕",
    "亚洲短趾百灵": "短趾百灵", "亚洲漠地林莺": "荒漠林莺",
    "里海银鸥": "黄腿银鸥", "西方秧鸡": "西秧鸡",
}
REQUIRED = {"鸟种", "观察日期", "地点"}


def parse_date(text):
    text = text.strip()
    # Day-first/month-first dates are deliberately unsupported: no guessing.
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
                "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
                "%Y.%m.%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y%m%d")
        except ValueError:
            pass
    raise ValueError(f"无效或不明确的观察日期：{text!r}；请使用 YYYY-MM-DD")


def clean_name(name):
    name = re.split(r"\s|（|\(|\[", name.strip())[0]
    if not re.fullmatch(r"[\u3400-\u9fff·•]+", name):
        raise ValueError("鸟种必须为中文名称；英文、混合种或不确定鸟种需人工核对")
    return CUSTOM_NAME_MAP.get(name, name)


def read_records(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        first = stream.readline()
        stream.seek(0)
        # Detect from the header, not data that may contain quoted punctuation.
        candidates = []
        for delimiter in (",", "\t", ";"):
            header = next(csv.reader([first], delimiter=delimiter, strict=True), [])
            if len(header) > 1:
                candidates.append((len(header), delimiter))
        if not candidates:
            raise ValueError("无法识别表头或分隔符（支持逗号、制表符、分号）")
        delimiter = max(candidates)[1]
        reader = csv.reader(stream, delimiter=delimiter, strict=True)
        headers = [h.strip() for h in next(reader)]
        if not all(headers) or len(set(headers)) != len(headers):
            raise ValueError("表头包含空列名或重复列名")
        if not REQUIRED.issubset(headers):
            raise ValueError("缺少必需列：" + "、".join(sorted(REQUIRED - set(headers))))
        records, groups, skipped, unknown = [], set(), 0, 0
        for values in reader:
            if not values or not any(value.strip() for value in values):
                continue
            if len(values) != len(headers):
                raise ValueError(f"第 {reader.line_num} 行列数与表头不一致")
            row = dict(zip(headers, (value.strip() for value in values)))
            date = parse_date(row["观察日期"])
            location = row["地点"]
            if not location:
                raise ValueError(f"第 {reader.line_num} 行地点为空")
            # Validate every row, even unidentified species, before grouping.
            group = (date, location, row.get("Submission ID", ""), row.get("开始时间", ""))
            groups.add(group)
            if len(groups) > 1:
                raise ValueError("文件包含多个日期、地点、开始时间或清单；请按一次观鸟清单拆分后转换")
            raw_name = row["鸟种"]
            if not raw_name:
                raise ValueError(f"第 {reader.line_num} 行鸟种为空")
            if "未识别" in raw_name:
                skipped += 1
                continue
            name = clean_name(raw_name)
            count = None
            if "数量" in headers:
                value = row["数量"]
                if value.upper() == "X" or not value:
                    unknown += 1
                elif re.fullmatch(r"[0-9]+", value) and int(value) > 0:
                    count = int(value)
                    if count > 999999999999999:
                        raise ValueError("数量超过 Excel 可精确保存的整数范围")
                else:
                    raise ValueError(f"第 {reader.line_num} 行数量无效：{value!r}")
            records.append((name, count))
        if not records:
            raise ValueError("没有可导出的鸟种记录")
        names = [record[0] for record in records]
        if len(set(names)) != len(names):
            raise ValueError("鸟种名称重复（或映射后重复）；请人工核对单次清单，不自动合并数量")
        date, location, _, _ = next(iter(groups))
        return records, date, location, "数量" in headers, skipped, unknown


def write_xlsx(records, target, has_count):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "导入数据"
    ws.append(["中文名", "数量"] if has_count else ["中文名"])
    for name, count in records:
        ws.append([name, count] if has_count else [name])
        # Explicit text cells, never formulas, even if future mappings change.
        ws.cell(ws.max_row, 1).data_type = "s"
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 12
    wb.save(target)
    wb.close()


def convert_one(path, output_dir):
    records, date, location, has_count, skipped, unknown = read_records(path)
    location = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", location).strip(" .")
    # Leave byte budget for date, species count, collision suffix and extension.
    location = location.encode("utf-8")[:180].decode("utf-8", errors="ignore").rstrip(" .") or "地点"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{date}-{location}-{len(records)}"
    number = 1
    while True:
        suffix = "" if number == 1 else f"-{number}"
        outfile = output_dir / f"{stem}{suffix}.xlsx"
        try:
            # Exclusive creation avoids overwriting even concurrent conversions.
            stream = outfile.open("xb")
            break
        except FileExistsError:
            number += 1
    try:
        with stream:
            write_xlsx(records, stream, has_count)
    except Exception:
        outfile.unlink(missing_ok=True)
        raise
    print(f"已生成：{outfile}")
    if skipped:
        print(f"提示：已跳过 {skipped} 条“未识别”记录。")
    if unknown:
        print(f"警告：{unknown} 条 X/空数量保留为空白，导入前必须人工核对，未推测数量。")
    if not has_count:
        print("警告：没有数量列，导入前请人工核对数量要求。")
    return outfile


def main(argv=None):
    parser = argparse.ArgumentParser(description="eBird 中文单次观鸟清单 → XLSX（仅本地处理）")
    parser.add_argument("files", nargs="*", type=Path, help="CSV/TSV 文件；默认扫描当前目录")
    parser.add_argument("-o", "--output-dir", type=Path, default=Path("output"))
    parser.add_argument("--version", action="version", version=VERSION)
    args = parser.parse_args(argv)
    files = args.files or sorted(p for p in Path.cwd().iterdir()
                                if p.is_file() and p.suffix.lower() in {".csv", ".tsv"}
                                and not p.name.startswith("._"))
    if not files:
        print("没有找到 CSV/TSV 文件。请放入中文单次清单后重试。", file=sys.stderr)
        return 1
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        print("缺少 openpyxl，请按照 README 安装依赖或运行 macOS 启动器。", file=sys.stderr)
        return 1
    success = 0
    for path in files:
        try:
            convert_one(path, args.output_dir)
            success += 1
        except (ValueError, OSError, csv.Error, UnicodeError) as exc:
            print(f"失败：{path.name}：{exc}", file=sys.stderr)
    print(f"处理结果：成功 {success} 个，失败 {len(files) - success} 个。")
    return 0 if success == len(files) else 1


if __name__ == "__main__":
    sys.exit(main())
