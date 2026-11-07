# eBird → 中国观鸟记录中心转换工具

**v1.5.1** · Joc · Python 3.9+ · 本地处理 · MIT

把包含中文鸟种名称的单次观鸟清单 CSV / TSV 整理成 XLSX，供人工检查后尝试导入中国观鸟记录中心。基于本地 v1.5 openpyxl 轻量版整理。

- [使用说明与下载](https://uioiu.com/ebird/)
- [下载 v1.5.1 ZIP](https://uioiu.com/ebird/downloads/eBird-ChinaBird-Converter-v1.5.1.zip)
- [源码](https://github.com/Jocioi/eBird-ChinaBird-Converter)

这是个人辅助工具，**不是 eBird 或中国观鸟记录中心的官方工具**。内置名称映射只覆盖部分旧名称，不代表完整或最新分类体系，也不保证平台接受导入。转换不会联网、上传或修改原始记录；上传由你在目标网站手动完成。

## 浏览器网页版（2026-11-07）

直接打开 [在线转换](https://uioiu.com/ebird/#convert)，无需安装 Python。网页和脚本加载后，CSV/TSV 读取、校验、预览和 XLSX 生成都在浏览器本地进行，不上传观鸟记录，不请求远程转换接口，不含统计追踪或 CDN 依赖。

1. 选择 UTF-8 中文表头的单次清单，可多选；网页版每次最多 50 个文件，每个 5 MB。
2. 需要调整鸟名时，到下方搜索、修改、增加或删除规则。点击“应用规则并检查文件”生效并自动记住。
3. 逐个检查输出名称、未验证项和数量提示，新对应确认后可分别下载 XLSX，或把所有成功清单打包为 ZIP。ZIP 含独立 Excel 和成功/失败报告，不合并清单。日期、地点仍只用于文件名，不包含在工作表中。

应用规则即自动写入本机 localStorage；下载时记住确认过的鸟名对应，下次自动恢复，无需再次选择。可导入/导出 JSON，也可清除保存。只保存鸟名对应，不保存地点、日期或数量。换设备/浏览器或清除网站数据会丢失，请导出备份。修改规则会使旧预览和下载确认失效，需重新检查；确认过的同一对应不会再要求选择，但 X 或缺失数量仍须按本次清单核对。输出下载由浏览器管理，同页重复下载自动加序号；最终是否覆盖本机同名文件由浏览器下载设置决定。

**范围说明：** 中国观鸟记录中心 [官方通知](https://www.birdreport.cn/home/notice/upgrade.html) 称 2024-01-01 起使用“郑四”；eBird 使用 eBird/Clements，不等同 IOC，[v2026 更新](https://www.birds.cornell.edu/clementschecklist/introduction/updateindex/october-2026/) 发布于 2026-11-02。现有 12 条是作者以前遇到差异时手工添加，不是完整、最新或逐种验证的官方转换表。涉及分类拆分/合并时不可只按中文名或同学名猜测。所有命中规则标为待核对，未命中原样保留并标为未验证，不保证目标平台认可。

网页复用 v1.5.1 的校验和工作表结构，并保守拒绝鸟名中的明显斜线、杂交、不确定种标记，避免它们被附加内容清理误截断。未自动转换任何科学分类概念，也不自动提交到目标网站。原 Mac v1.5.1 ZIP 和校验文件保持不变。

## macOS 快速使用

1. 安装 Python 3.9 或以上（推荐仍获安全维护的版本），可从 [python.org](https://www.python.org/downloads/macos/) 获取。
2. 下载并解压 ZIP。将**单次观鸟清单**的 CSV / TSV 放入解压目录。不要直接放入包含多次观鸟的历史总表。
3. 双击 `双击转换.command`。首次运行会先询问是否从官方 PyPI 安装 openpyxl 及其依赖。输入 `y` 才会下载，依赖只装到该目录的 `.venv-ebird-chinabird`，不会改系统 Python。
4. 在 `output` 中查看 `YYYYMMDD-地点-鸟种数.xlsx`。同名文件会增加 `-2`、`-3`，不会覆盖已有文件。
5. 逐项核对鸟种和数量，再按[中国观鸟记录中心](https://www.birdreport.cn)当前模板要求手动导入。日期和地点只体现在文件名，需在平台核对或填写。

若系统未直接打开 `.command`，可在终端进入解压目录后执行 `bash 双击转换.command`。不要关闭系统安全保护；仅运行你已确认来源的下载。

## 输入要求与安全限制

支持 UTF-8（含 BOM），逗号、制表符或分号分隔。`.csv` 和 `.tsv` 均可自动扫描。当前版本**要求中文表头、中文鸟种名称**，不会自动翻译英文 eBird 导出。需要将导出按单次清单整理，并核对以下字段：

| 列名 | 要求 |
| --- | --- |
| 鸟种 | 必填；中文名后可有空格英文名、括号注释。含“未识别”的行会跳过并计数 |
| 观察日期 | 必填；`YYYY-MM-DD`、`YYYY/MM/DD` 或 `YYYY.MM.DD`，可带 `HH:MM:SS` |
| 地点 | 必填，文件内须完全一致 |
| 数量 | 可选；正整数；`X` 或空白保持为空白并提示人工核对，不会变成 0 或 1 |

同一文件只允许一个日期、一个地点；如存在 `Submission ID` 或 `开始时间` 列，各列也必须为同一值。同日同地点多次清单如没有不同的 ID 或开始时间仍无法可靠识别，因此**请自行保证每个文件只包含一次观鸟清单**。不自动拆分、不自动合并或求和。

空/重复表头、缺少必填列、列数错位、无效或含糊日期（如 `11/07/2026`）、英文鸟种、杂交或不确定名称、负数/小数数量、重复鸟种（含映射后重复）都会报错，当前文件不生成结果。请修正原始文件的副本后重试。空行会忽略；多文件批处理中一个文件失败不阻止其他文件，最终会明确报告成功/失败数量。

没有数量列时仅输出中文名；存在 `X`、空数量或缺数量列时，必须人工补充/核对，目标平台可能拒绝导入。

## 命令行（macOS / Windows / Linux）

Python 主程序跨平台；双击启动器仅适用于 macOS。以下为 macOS / Linux 示例：

```sh
python3 -m venv .venv-ebird-chinabird
.venv-ebird-chinabird/bin/python -m pip install --index-url https://pypi.org/simple -r requirements.txt
.venv-ebird-chinabird/bin/python ebird_converter.py
.venv-ebird-chinabird/bin/python ebird_converter.py my-list.csv other-list.tsv -o output
.venv-ebird-chinabird/bin/python ebird_converter.py --version
```

Windows 使用 `py -3 -m venv .venv-ebird-chinabird` 创建环境，并将以上 Python 路径替换为 `.venv-ebird-chinabird\Scripts\python.exe`。Windows/Linux 未进行桌面实机测试。

退出码：全部成功 `0`；没有输入、缺少依赖、部分或全部失败 `1`；命令参数错误 `2`。命令行不会等待按键，适合批处理。依赖安装完成后可断网转换。

## 鸟种映射

保留 v1.5 的 12 条对应，仅做完整中文名称匹配：金斑鸻→金鸻、灰斑鸻→灰鸻、白冠燕尾→白额燕尾、须浮鸥→灰翅浮鸥、理氏鹨→田鹨、蒙古银鸥→西伯利亚银鸥、西方灰伯劳→西灰伯劳、西方毛脚燕→毛脚燕、亚洲短趾百灵→短趾百灵、亚洲漠地林莺→荒漠林莺、里海银鸥→黄腿银鸥、西方秧鸡→西秧鸡。

映射可在 `ebird_converter.py` 的 `CUSTOM_NAME_MAP` 中人工调整。名称不在映射表中时原样保留，不代表该物种一定获目标平台认可。

## 测试与发布

```sh
.venv-ebird-chinabird/bin/python -m unittest discover -s tests -v
```

测试只使用临时生成的合成记录，不包含真实观鸟数据。发布包仅包含转换代码、启动器、依赖说明、文档、MIT 许可证与合成测试，不含 CSV、TSV、XLSX、虚拟环境或个人路径。

## v1.5.1 更新

- 补齐 TSV 扫描、非交互 CLI、明确失败退出码。
- 严格校验日期、表头、行结构、数量和单次清单，禁止静默使用今天日期。
- 物种名称精确映射，重复种名不再静默保留；文本按文本写入，防止 Excel 公式执行。
- 保留未知数量为空白并警告；输出独立目录且不覆盖。
- macOS 首次安装明确确认，只用官方 PyPI 与独立环境。

## 许可

保留原项目 [MIT LICENSE](LICENSE)，© 2025 Joc。Created with assistance from ChatGPT (OpenAI).
