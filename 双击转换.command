#!/bin/bash
# Only this folder's virtual environment is changed. Conversion stays offline.
cd "$(dirname "$0")" || exit 1
finish() { echo "$2"; read -r -p '按 Enter 退出…' _; exit "$1"; }
command -v python3 >/dev/null 2>&1 || finish 1 '需要 Python 3.9 或以上：https://www.python.org/downloads/macos/'
python3 -c 'import sys; sys.exit(sys.version_info < (3,9))' || finish 1 '需要 Python 3.9 或以上。'
VENV='.venv-ebird-chinabird'
if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV" || finish 1 '无法创建独立环境。'
fi
PY="$VENV/bin/python"
[ -x "$PY" ] || finish 1 '独立环境不完整，请将 .venv-ebird-chinabird 移走后重试。'
if ! "$PY" -c 'import openpyxl; from importlib.metadata import version; v=tuple(map(int,version("openpyxl").split("."))); assert (3,1,5) <= v < (3,2)' >/dev/null 2>&1; then
  echo '首次运行需要联网从官方 PyPI 安装 openpyxl 及其依赖，仅安装到此文件夹的独立环境。'
  read -r -p '是否安装？输入 y 确认，其余取消：' ANSWER
  [ "$ANSWER" = 'y' ] || finish 1 '已取消，未安装依赖。'
  # Isolated mode ignores user pip configuration; no fallback package mirrors.
  PIP_CONFIG_FILE=/dev/null "$PY" -m pip --isolated install --index-url https://pypi.org/simple --only-binary=:all: -r requirements.txt || finish 1 '依赖安装失败，请检查网络后重试。'
fi
"$PY" ebird_converter.py
STATUS=$?
if [ "$STATUS" -eq 0 ]; then
  finish 0 '转换完成。请先检查 output 中的文件，再手动导入。'
else
  finish "$STATUS" '部分或全部转换失败，请查看上方错误。成功的文件仍保留在 output 中。'
fi
