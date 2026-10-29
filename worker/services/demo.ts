import type { Analysis, Generation, Review, Stage } from '../../shared/contracts';

export const demoAnalysis: Analysis = {
  understanding:
    '【演示示例】制作一个 Python 工具，将 Excel 表格中的记录按日期分类并导出。本演示使用预置结果，不会理解任意输入，也不会调用 OpenAI。',
  approach: [
    '读取 Excel 并检查指定的日期列',
    '转换日期，按月份分组',
    '为每个分组导出独立表格，并保留原始数据',
    '提供命令行参数与清晰的错误提示',
  ],
  technologies: ['Python 3.11+', 'pandas', 'openpyxl', 'argparse'],
  deliverables: ['main.py', 'requirements.txt', 'README.md'],
  complexity: 'simple',
  estimatedTokens: 0,
  questions: ['本演示按月份分类；真实任务请确认日期列名与分类粒度。'],
};
export const demoGeneration: Generation = {
  summary:
    '【演示交付】已载入预置的 Excel 日期分类示例，包含 Python 脚本、依赖清单和使用说明。该源码未在本平台执行。',
  instructions:
    '安装 Python 3.11+，运行 pip install -r requirements.txt，然后运行 python main.py input.xlsx --date-column 日期。请先备份输入文件。',
  files: [
    {
      path: 'main.py',
      language: 'python',
      content: `"""HoriDev 演示：按月份分类 Excel。未在平台执行。"""\nfrom pathlib import Path\nimport argparse\nimport sys\nimport pandas as pd\n\ndef split_excel(source: Path, destination: Path, date_column: str) -> int:\n    if not source.is_file() or source.suffix.lower() != ".xlsx":\n        raise ValueError("输入必须是存在的 .xlsx 文件")\n    frame = pd.read_excel(source)\n    if date_column not in frame.columns:\n        raise ValueError(f"找不到日期列: {date_column}")\n    dates = pd.to_datetime(frame[date_column], errors="coerce")\n    if dates.isna().any():\n        raise ValueError(f"有 {int(dates.isna().sum())} 行日期为空或格式无效")\n    destination.mkdir(parents=True, exist_ok=True)\n    groups = list(frame.groupby(dates.dt.strftime("%Y-%m")))\n    targets = [(destination / f"{month}.xlsx", group) for month, group in groups]\n    if any(path.exists() for path, _ in targets):\n        raise FileExistsError("输出文件已存在，请选择空目录以避免覆盖")\n    for path, group in targets:\n        group.to_excel(path, index=False)\n    return len(targets)\n\ndef main() -> int:\n    parser = argparse.ArgumentParser(description="按月份分类 Excel 表格")\n    parser.add_argument("source", type=Path)\n    parser.add_argument("--output", type=Path, default=Path("output"))\n    parser.add_argument("--date-column", default="日期")\n    args = parser.parse_args()\n    try:\n        count = split_excel(args.source, args.output, args.date_column)\n        print(f"已导出 {count} 个分类文件")\n        return 0\n    except (ValueError, OSError, ImportError) as error:\n        print(f"处理失败: {error}", file=sys.stderr)\n        return 1\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n`,
    },
    {
      path: 'requirements.txt',
      language: 'plaintext',
      content: 'pandas>=2.2,<4\nopenpyxl>=3.1,<4\n',
    },
    {
      path: 'README.md',
      language: 'markdown',
      content:
        '# Excel 日期分类工具\n\n> HoriDev 预置演示源码；不是实际 AI 调用结果。平台未运行此程序或验证依赖。\n\n## 使用方法\n\n需要 Python 3.11+。建议在虚拟环境中安装：\n\n```sh\npip install -r requirements.txt\npython main.py input.xlsx --date-column 日期 --output output\n```\n\n输入文件必须为 .xlsx，日期列不能为空。程序按年月分组，为每个月导出一个文件。输入文件不会被修改，已存在的输出文件不会被覆盖。\n\n## 注意\n\n运行前备份数据，检查生成的文件和依赖。大型文件会使用较多内存。此版本没有在 HoriDev 中执行自动化测试。\n',
    },
  ],
};
export const demoReview: Review = {
  summary: '【演示静态审查】以下是预置审查结果。没有运行 Python、安装依赖或执行自动化测试。',
  issues: [
    {
      severity: 'warning',
      file: 'main.py',
      message: '大型 Excel 一次载入内存；正式使用前请评估数据量。',
    },
    {
      severity: 'info',
      file: 'requirements.txt',
      message: '依赖版本范围需要在实际运行环境中验证。',
    },
  ],
  coverage: ['日期列缺失检查', '无效日期拒绝处理', '输出文件存在时拒绝覆盖', '命令行错误提示'],
};
export function demoResult(stage: Stage) {
  return stage === 'analyze' ? demoAnalysis : stage === 'generate' ? demoGeneration : demoReview;
}
