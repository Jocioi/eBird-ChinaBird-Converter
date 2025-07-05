# eBird-to-China Bird List Converter 🐦

> ⚠️ 本工具仅支持 macOS 系统。This tool is macOS only.

将 eBird 导出表一键转换为中国鸟类名录格式的工具  
Convert eBird export tables into the China Bird List format in one command.

---

## ✨ Features  |  功能亮点
| EN | 中文 |
|----|------|
| ✔  Auto-adapt species name changes (e.g. `金斑鸻` → `金鸻`, `须浮鸥` → `灰翅浮鸥`) for smooth import to the Chinese Bird Records Center | ✔  可自动适配部分鸟种名称变化（如 eBird 中 **金斑鸻** → **金鸻**、**须浮鸥** → **灰翅浮鸥**），方便导入中国观鸟中心 |
| ✔  Custom species name mapping (easily extendable) | ✔  内置 **自定义物种映射表**，可按需扩展 |
| ✔  Drop rows containing “未识别” (“Unidentified”) automatically | ✔  自动删除 “**未识别**” 记录 |
| ✔  Simple CLI – run with one command | ✔  命令行一键运行，零配置 |
| ✔  UTF-8 friendly, reads CSV/TSV exported from eBird | ✔  UTF-8 兼容，直接读取 eBird 导出的 CSV/TSV |

---

## 🚀 Quick Start  |  快速上手

### 1️⃣ 📦 Download the tool | 下载转换工具
[![Download](https://img.shields.io/badge/Download%20ZIP-v1.1.1-blue?logo=github)](https://github.com/Jocioi/eBird-ChinaBird-Converter/releases/download/v1.1/eBird-ChinaBird-Converter_v1.1.1.zip)

点击上方按钮下载压缩包并解压。  
Click the button above to download the `.zip` package and unzip it.

---

### 2️⃣ 🐦 Export your eBird data | 导出 eBird 记录
登录 [eBird.org](https://ebird.org) → **My eBird** → **Download My Data**，系统会通过邮件发送下载链接（CSV/TSV）。  
Log in to eBird, navigate to **My eBird → Download My Data**, and download the observations file (CSV/TSV).

---

### 3️⃣ 📁 Place the eBird file into the tool folder  
将下载得到的 `*_observations.csv`（或 .tsv）文件放入刚才解压的工具文件夹内。  
Put the downloaded `*_observations.csv` (or .tsv) into the unzipped converter folder.

---

### 4️⃣ 🖱️ Double-click to convert  
双击 `2-双击出奇迹.command`（macOS）或运行同名脚本，程序会自动生成 `YYYYMMDD-地点-鸟种数量.xlsx`。  
Double-click `2-双击出奇迹.command` to generate an Excel file like `20250705-太子尖-18.xlsx`.

---

### 5️⃣ 📤 Import to 中国观鸟记录中心  
登录 [中国观鸟记录中心](https://www.birdreport.cn) → “导入记录” → 选择刚生成的 `.xlsx` 文件并上传即可。  
Log in to the Chinese Bird Records Center and import the generated `.xlsx` file via the “Import Records” function.

---

## 📝 License
MIT © 2025 **Joc**  
Created with assistance from ChatGPT (OpenAI).

---

## 🤝 Contributing
Pull requests are welcome! Feel free to open an issue for:

- bug fixes / feature requests  
- new species mapping rules  
- documentation / translation improvements  

Happy birding! 🐤
