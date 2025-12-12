export const zh = {
  // Common
  common: {
    loading: '加载中...',
    submit: '提交',
    cancel: '取消',
    send: '发送',
    refresh: '刷新',
    close: '关闭',
    back: '返回',
    required: '必填',
    system: '系统'
  },

  // Header
  header: {
    title: '客服中心',
    subtitle: 'OnFire 工单系统',
    newTicket: '新建工单',
    myTickets: '我的工单'
  },

  // Identity Card
  identity: {
    title: '身份信息',
    verified: 'JWT 已验证',
    product: '产品',
    email: '邮箱',
    externalId: '用户ID',
    level: '等级'
  },

  // Ticket Form
  form: {
    selectTemplate: '选择工单类型',
    selectTemplatePlaceholder: '请选择...',
    category: '问题类别',
    selectCategoryPlaceholder: '请选择类别',
    subcategory: '子类别',
    selectSubcategoryPlaceholder: '请选择子类别',
    submitTicket: '提交工单',
    submitting: '提交中...',
    submitSuccess: '提交成功，客服会尽快处理！',
    submitFailed: '提交失败，请稍后重试',
    verification: '人机验证'
  },

  // Error states
  error: {
    configError: '配置错误',
    missingProductId: '缺少产品ID (productId)。请确保通过 JWT token 或 URL 参数提供有效的产品标识。',
    urlExample: '示例 URL 格式：',
    noTemplate: '当前产品未配置模版，请联系管理员'
  },

  // Form defaults
  defaults: {
    detailLabel: '问题详情',
    detailPlaceholder: '请详细描述问题、步骤、期望',
    untitledTicket: '未命名工单',
    noContent: '用户未填写详情'
  },

  // Footer
  footer: {
    copyright: '© {{year}} OnFire · 现代化客服工单系统'
  },

  // Tickets List
  tickets: {
    title: '我的工单',
    total: '全部工单',
    totalHint: '我提交的工单总数',
    pending: '待处理',
    pendingHint: '等待客服处理',
    replied: '已回复',
    repliedHint: '客服已回复',
    noTickets: '暂无工单',
    filters: {
      allStatus: '全部状态',
      new: '待处理',
      processing: '处理中',
      replied: '已回复',
      escalated: '已升级',
      closed: '已关闭'
    },
    sort: {
      recent: '按更新时间',
      priority: '按优先级'
    },
    status: {
      new: '待处理',
      processing: '处理中',
      replied: '已回复',
      escalated: '已升级',
      closed: '已关闭'
    },
    priority: {
      high: '高',
      medium: '中',
      low: '低'
    },
    slaWarning: 'SLA 超时'
  },

  // Ticket Detail
  detail: {
    selectTicket: '选择工单查看详情',
    content: '问题描述',
    team: '团队',
    product: '产品',
    level: '等级',
    history: '操作历史',
    replies: '回复记录',
    noReplies: '暂无回复',
    replyForm: '追加回复',
    replyPlaceholder: '输入回复内容...',
    sendReply: '发送',
    internal: '内部',
    turnstileRequired: '请先通过验证码，再提交回复',
    replyFailed: '回复失败，请稍后重试'
  },

  // Time
  time: {
    justNow: '刚刚',
    minutesAgo: '{{count}}分钟前',
    hoursAgo: '{{count}}小时前',
    daysAgo: '{{count}}天前'
  }
};

export type Translations = typeof zh;
