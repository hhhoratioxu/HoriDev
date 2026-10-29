INSERT OR IGNORE INTO platform_settings (key,value,updated_at) VALUES ('budget','{"totalBudgetUsd":47,"softBudgetUsd":35,"hardBudgetUsd":42,"safetyReserveUsd":5,"defaultUserLimitUsd":3,"taskLimitUsd":0.75,"maxConcurrent":2,"maxTaskCalls":6,"maintenance":false,"aiEnabled":true,"modelPrices":{"gpt-6-luna":{"input":0.1,"cached":0.01,"output":0.5},"gpt-6.1-sol":{"input":2,"cached":0.1,"output":10}}}',0);
--> statement-breakpoint
INSERT OR IGNORE INTO pricing_plans (id,name,description,price_label,features,task_limit,active,highlighted) VALUES
('free','Free','先体验，再开始。','免费演示','["预置 Excel 示例","完整工作区体验","源码查看与 ZIP 导出","不提供免费真实 AI 调用"]',3,1,0),
('starter','Starter','为你的第一个想法。','按任务报价','["Python 脚本与简单修复","需求分析与方案确认","AI 静态审查","人工确认后启用资源"]',10,1,0),
('pro','Pro','给更大的创造空间。','按项目报价','["多文件项目开发","复杂代码分析与重构","文件版本与代码 Diff","更高额度由管理员核定"]',50,1,1),
('custom','Custom','为独特的需求定制。','联系洽谈','["企业项目需求评估","定制交付范围","人工报价与服务支持","桌面软件列入后续规划"]',0,1,0);
