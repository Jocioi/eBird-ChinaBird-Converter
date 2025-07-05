# eBird-to-China Bird List Converter 🐦

将 eBird 导出表一键转换为中国鸟类名录格式的工具  
Convert eBird export tables into the China Bird List format in one command.

---

## ✨ Features  |  功能亮点
| EN | 中文 |
|----|------|
| ✔  Auto-map *Whiskered Tern* (`须浮鸥`) → *White-winged Tern* (`灰翅浮鸥`) | ✔  自动将 **须浮鸥** 重命名为 **灰翅浮鸥** |
| ✔  Custom species name mapping (easily extendable) | ✔  内置 **自定义物种映射表**，可按需扩展 |
| ✔  Drop rows containing “未识别” (“Unidentified”) automatically | ✔  自动删除 “**未识别**” 记录 |
| ✔  Simple CLI – run with one command | ✔  命令行一键运行，零配置 |
| ✔  UTF-8 friendly, reads CSV/TSV exported from eBird | ✔  UTF-8 兼容，直接读取 eBird 导出的 CSV/TSV |

---

## 🚀 Quick Start  |  快速上手

### 1. Clone & install dependencies
```bash
git clone https://github.com/<YOUR_USERNAME>/eBird-ChinaBird-Converter.git
cd eBird-ChinaBird-Converter
pip install -r requirements.txt   # 目前仅依赖 pandas，已列出版本
```

### 2. Run
```bash
python ebird-convert-ChinaBird.py <input.tsv> <output.tsv>
# 省略参数时会提示交互选择
```

> 📝 **Tip**  
> - The script expects the eBird export file to be **tab-separated UTF-8** (default from eBird).  
> - 输出文件将覆盖同名文件，请提前备份。  

---

## 🔧 Command-line Options
| Flag | Description | 示例 |
|------|-------------|------|
| `-i, --input`  | input path of eBird export | `-i data/eBird_export_202506.tsv` |
| `-o, --output` | output path for converted table | `-o out/converted.tsv` |
| `-l, --lang`   | language code for UI messages (`en` / `zh`) | `-l zh` |

---

## 📁 File Structure
```
eBird-ChinaBird-Converter/
├── ebird-convert-ChinaBird.py
├── requirements.txt
├── LICENSE
└── README.md
```

---

## 🛠  Extending the Species Map

Edit `custom_name_map` inside `ebird-convert-ChinaBird.py`:

```python
custom_name_map = {
    '金斑鸻': '金鸻',
    '灰斑鸻': '灰鸻',
    '须浮鸥': '灰翅浮鸥',  # ← new rule
    # '旧名': '新名',
}
```

---

## 📝 License

MIT © 2025 **Joc**  
Created with assistance from ChatGPT (OpenAI).

---

## 🤝 Contributing

PRs are welcome! Feel free to open an issue or submit a pull request for:

- bug fixes / feature requests  
- new species mapping rules  
- docs / translation improvements  

Happy birding! 🐤
