export const messages = {
  'zh-CN': {
    common: {
      save: '保存',
      cancel: '取消',
      loading: '正在加载',
      workspace: '工作区',
      dashboard: '工作台',
      demo: '预置演示',
    },
    errors: { network: '连接服务失败，请重试。' },
  },
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      loading: 'Loading',
      workspace: 'Workspace',
      dashboard: 'Dashboard',
      demo: 'Demo fixture',
    },
    errors: { network: 'Unable to connect. Please try again.' },
  },
} as const;
export type Locale = keyof typeof messages;
export function dictionary(locale: Locale = 'zh-CN') {
  return messages[locale];
}
