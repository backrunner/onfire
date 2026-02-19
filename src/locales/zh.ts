export const zh = {
  // Common
  common: {
    loading: '加载中...',
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    delete: '删除',
    edit: '编辑',
    create: '新建',
    refresh: '刷新',
    search: '搜索',
    submit: '提交',
    close: '关闭',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    yes: '是',
    no: '否',
    all: '全部',
    none: '无',
    copy: '复制',
    reset: '重置',
    enable: '启用',
    disable: '禁用',
    required: '必填',
    optional: '可选',
    actions: '操作',
    status: '状态',
    priority: '优先级',
    logout: '退出',
    login: '登录',
    checkingLogin: '正在检查登录...'
  },

  // Navigation
  nav: {
    dashboard: 'Dashboard',
    tickets: '工单列表',
    account: '账户',
    admin: '管理'
  },

  // Topbar
  topbar: {
    title: 'OnFire 客服工作台',
    searchPlaceholder: '搜索主题/ID',
    pending: '待处理',
    overdue: '超时',
    loggedIn: '已登录 {{email}}'
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    subtitle: '工单系统概览',
    stats: {
      pending: '待处理工单',
      pendingHint: '等待接单/处理',
      escalated: '已升级工单',
      escalatedHint: '需要高级支援',
      overdue: '超时工单',
      overdueHint: 'SLA 已超时',
      products: '产品数',
      productsHint: '当前管理范围'
    },
    quickActions: '快捷操作',
    viewAllTickets: '查看全部工单',
    viewOverdue: '查看超时工单',
    recentTickets: '最近工单',
    noTickets: '暂无工单',
    noTicketsHint: '新工单将出现在这里'
  },

  // Tickets
  tickets: {
    title: '工单管理',
    subtitle: '查看和处理客户工单',
    filters: {
      allStatus: '全部状态',
      allPriority: '全部优先级',
      allTeam: '全部团队',
      allProduct: '全部产品',
      overdueOnly: '仅超时'
    },
    sort: {
      priority: '按优先级',
      recent: '按时间',
      overdue: '按超时'
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
    list: {
      total: '共 {{count}} 条',
      selected: '已选 {{count}} 条',
      noTickets: '暂无工单',
      noTicketsHint: '当前筛选条件下没有工单'
    },
    detail: {
      title: '工单详情',
      ticketId: '工单号',
      customer: '客户',
      product: '产品',
      team: '团队',
      assignee: '处理人',
      createdAt: '创建时间',
      updatedAt: '更新时间',
      sla: 'SLA 状态',
      slaBreached: 'SLA 超时',
      content: '问题描述',
      metadata: '附加信息',
      timeline: '时间线',
      replies: '回复记录',
      history: '操作历史',
      noReplies: '暂无回复',
      internalNote: '内部备注'
    },
    actions: {
      reply: '回复',
      replyPlaceholder: '输入回复内容...',
      sendReply: '发送回复',
      assign: '分配',
      assignTo: '分配给',
      assignPlaceholder: '坐席ID',
      reassign: '重新分配',
      escalate: '升级',
      escalateReason: '升级原因',
      escalatePlaceholder: '请说明升级原因',
      close: '关闭工单',
      closeReason: '关闭原因',
      closePlaceholder: '请说明关闭原因',
      changePriority: '修改优先级',
      priorityReason: '修改原因',
      priorityPlaceholder: '请说明修改原因'
    },
    bulk: {
      assign: '批量分配',
      close: '批量关闭',
      assignTitle: '批量分配工单',
      closeTitle: '批量关闭工单',
      assignHint: '将选中的 {{count}} 个工单分配给指定坐席',
      closeHint: '关闭选中的 {{count}} 个工单',
      defaultCloseReason: '批量关闭'
    },
    historyActions: {
      created: '创建工单',
      assign: '分配工单',
      bulk_assign: '批量分配',
      status_change: '状态变更',
      bulk_status_change: '批量状态变更',
      priority_change: '优先级变更',
      escalated: '工单升级',
      closed: '关闭工单',
      auto_closed: '自动关闭',
      agent_replied: '客服回复',
      customer_replied: '客户回复'
    }
  },

  // Account
  account: {
    title: '账户安全',
    subtitle: '更新登录密码。不会提供找回密码入口，请妥善保存。',
    currentPassword: '当前密码',
    newPassword: '新密码',
    confirmPassword: '确认新密码',
    updatePassword: '更新密码',
    passwordMismatch: '两次输入的新密码不一致',
    passwordUpdated: '密码已更新，下次登录请使用新密码',
    passwordUpdateFailed: '修改失败，请检查当前密码或稍后重试'
  },

  // Login
  login: {
    title: '欢迎回来',
    subtitle: '使用邮箱密码登录管理后台',
    email: '邮箱',
    emailPlaceholder: 'admin@example.com',
    password: '密码',
    passwordPlaceholder: '••••••••',
    securityVerify: '安全验证',
    noTurnstile: '未配置 Turnstile（VITE_TURNSTILE_SITE_KEY），将跳过验证码',
    loginFailed: '登录失败，请检查账号或稍后重试',
    turnstileError: '验证码加载失败，请刷新页面重试',
    footer: 'OnFire · 现代化客服工单系统'
  },

  // Install
  install: {
    title: 'OnFire 安装向导',
    subtitle: '当前实例尚未初始化，请创建超级管理员并完成基础租户配置。',
    adminAccountSection: '创建超级管理员账户',
    adminEmail: '管理员邮箱',
    adminEmailPlaceholder: 'admin@yourcompany.com',
    displayName: '显示名称',
    displayNamePlaceholder: '张三',
    displayNameHint: '可选，不填将使用邮箱前缀',
    password: '密码',
    passwordPlaceholder: '请输入安全密码',
    confirmPassword: '确认密码',
    confirmPasswordPlaceholder: '再次输入密码',
    tenantSection: '配置初始租户',
    tenantName: '租户名称',
    tenantNamePlaceholder: '例如：Acme Inc',
    tenantNameHint: '安装时至少需要创建一个租户，后续可在管理后台新增/编辑。',
    passwordMinLength: '至少 8 个字符',
    passwordUppercase: '包含大写字母',
    passwordLowercase: '包含小写字母',
    passwordNumber: '包含数字',
    passwordMatch: '密码一致',
    passwordMismatch: '密码不一致',
    passwordInvalid: '密码不符合要求',
    tenantRequired: '请填写租户名称',
    installSuccess: '初始化完成，即将进入系统',
    installFailed: '初始化失败，请检查信息或稍后重试',
    finishInstall: '完成安装'
  },

  // Management
  management: {
    title: '系统管理',
    subtitle: '管理租户、产品、团队、模板和用户',
    perPage: '条/页',
    noAccess: '无{{type}}管理权限',
    noData: '暂无{{type}}数据',

    tabs: {
      tenants: '租户',
      products: '产品',
      teams: '团队',
      templates: '模板',
      users: '用户'
    },

    tenants: {
      create: '新建租户',
      namePlaceholder: '租户名称',
      nameRequired: '请输入租户名称',
      edit: '编辑租户'
    },

    products: {
      create: '新建产品',
      namePlaceholder: '产品名称',
      nameRequired: '请输入产品名称',
      edit: '编辑产品',
      sla: 'SLA（分钟）',
      slaHighAccept: '高-接单',
      slaHighReply: '高-回复',
      slaMediumAccept: '中-接单',
      slaMediumReply: '中-回复',
      slaLowAccept: '低-接单',
      slaLowReply: '低-回复',
      bindTeams: '绑定团队（逗号分隔ID）',
      bindTeamsPlaceholder: 'team-a,team-b'
    },

    teams: {
      create: '新建团队',
      namePlaceholder: '团队名称',
      nameRequired: '请输入团队名称',
      edit: '编辑团队',
      allowReassign: '允许重分配'
    },

    templates: {
      create: '新建模板',
      titlePlaceholder: '模板标题',
      titleRequired: '请填写标题与产品ID',
      productIdPlaceholder: '产品ID',
      categoriesPlaceholder: '分类(JSON数组)',
      schemaLabel: '表单 Schema (JSON)',
      schemaPlaceholder: '{"fields":[...]}',
      jsonError: '请检查分类/Schema 的 JSON 格式',
      edit: '编辑模板',
      formBuilder: '可视化表单构建',
      formBuilderHint: '添加字段并生成 Schema JSON',
      fieldLabel: '字段标题',
      fieldKey: '字段 key',
      fieldType: '类型',
      fieldRequired: '必填',
      fieldPlaceholder: '占位符（可选）',
      fieldOptions: '下拉选项，每行一个',
      addField: '添加字段',
      saveChanges: '保存修改',
      cancelEdit: '取消编辑',
      schemaPreview: 'Schema 预览',
      types: {
        text: '文本',
        textarea: '多行文本',
        number: '数字',
        email: '邮箱',
        select: '下拉'
      }
    },

    apiKeys: {
      title: 'Product API Key',
      productIdPlaceholder: '产品ID',
      namePlaceholder: '备注名称',
      generate: '生成 API Key',
      productIdRequired: '请输入产品ID',
      newKeyHint: '新 API Key（仅此处可见）',
      noKeys: '暂无 Key',
      revoked: '已吊销',
      rotate: '重置',
      revoke: '吊销'
    },

    categoryRoutes: {
      title: '类目路由',
      productIdPlaceholder: '产品ID',
      categoryPlaceholder: '类目',
      subcategoryPlaceholder: '子类目(可选)',
      teamIdPlaceholder: '团队ID',
      addRoute: '新增路由',
      noRoutes: '暂无路由数据',
      edit: '编辑类目路由',
      targetTeam: '目标团队ID',
      change: '改',
      delete: '删'
    },

    users: {
      accounts: '客服账号',
      searchEmail: '搜索邮箱...',
      editRole: '编辑用户角色',
      role: '角色',
      selectRole: '选择角色',
      displayName: '显示名'
    },

    agents: {
      title: '坐席/等级',
      searchAgent: '搜索坐席...',
      edit: '编辑坐席',
      level: '等级',
      active: '激活',
      inactive: '停用',
      teamIds: '团队ID（逗号分隔）',
      teamIdsPlaceholder: 'team-a,team-b',
      displayName: '显示名',
      email: '邮箱',
      avatarUrl: '头像 URL'
    },

    customers: {
      title: '客户聚合',
      searchCustomer: '搜索客户邮箱...',
      tenant: '租户',
      product: '产品',
      externalId: '外部ID',
      level: '等级'
    },

    deleteConfirm: {
      title: '确认删除',
      message: '此操作不可撤销，确定删除"{{name}}"？',
      inputHint: '请输入名称确认删除：'
    },

    email: {
      title: '邮件配置',
      subtitle: '配置邮件收发功能',
      config: {
        tab: '配置',
        noConfig: '暂无邮件配置',
        addConfig: '新建配置',
        testEmail: '测试邮件',
        sendTest: '发送测试',
        testSuccess: '测试邮件发送成功！消息ID：{{messageId}}',
        testFailed: '测试邮件发送失败',
        testEmailPlaceholder: 'your-email@example.com',
        inbound: '接收邮件',
        outbound: '发送邮件',
        enabled: '已启用',
        disabled: '已禁用',
        provider: '服务商',
        address: '邮箱地址',
        aiFilter: 'AI 过滤',
        aiFilterDesc: '使用 AI 过滤垃圾邮件和非工单邮件',
        filterStrictness: '过滤严格度',
        strictnessLow: '低 - 更宽松',
        strictnessMedium: '中 - 平衡',
        strictnessHigh: '高 - 更严格',
        sender: '发件人',
        senderName: '发件人名称',
        senderEmail: '发件人邮箱',
        senderNamePlaceholder: '客服团队',
        senderEmailPlaceholder: 'support@yourcompany.com',
        replyTo: '回复地址（可选）',
        replyToPlaceholder: 'replies@yourcompany.com',
        webhookSecret: 'Webhook 密钥',
        generateSecret: '生成密钥',
        generateSecretConfirm: '生成新的 webhook 密钥？旧密钥将失效。',
        secretGenerated: 'Webhook 密钥已生成',
        secretMessage: '请妥善保存此密钥，它不会再次显示。',
        copySecret: '复制密钥',
        apiKey: 'API 密钥',
        apiKeyPlaceholder: '输入 API 密钥',
        smtp: {
          host: 'SMTP 主机',
          hostPlaceholder: 'smtp.example.com',
          port: 'SMTP 端口',
          portPlaceholder: '587',
          user: 'SMTP 用户',
          userPlaceholder: 'user@example.com',
          password: 'SMTP 密码',
          passwordPlaceholder: '输入密码'
        },
        inboundProvider: '接收服务商',
        inboundAddress: '接收邮箱',
        inboundAddressPlaceholder: 'support@yourcompany.com',
        outboundProvider: '发送服务商',
        selectProduct: '选择产品',
        productId: '产品',
        productIdRequired: '请选择产品',
        save: '保存配置',
        saving: '保存中...',
        deleteConfig: '删除配置',
        deleteConfigConfirm: '确认删除此邮件配置？'
      },
      templates: {
        tab: '模板',
        noTemplates: '暂无自定义模板，使用默认模板。',
        addTemplate: '新建模板',
        editTemplate: '编辑邮件模板',
        createTemplate: '创建邮件模板',
        templateType: '模板类型',
        selectType: '选择类型',
        subjectTemplate: '主题模板',
        subjectPlaceholder: '[Ticket #{{ticket_id}}] {{subject}}',
        bodyTemplate: '正文模板 (HTML)',
        bodyPlaceholder: '输入 HTML 模板...',
        enabled: '启用',
        loadDefault: '加载默认模板',
        preview: '预览',
        source: '源码',
        rendered: '渲染',
        types: {
          ticket_created: '工单已创建',
          ticket_replied: '工单已回复',
          ticket_closed: '工单已关闭',
          ticket_escalated: '工单已升级'
        },
        variables: '可用变量',
        variablesHint: '在模板中使用 {{variable}} 语法'
      },
      logs: {
        tab: '日志',
        inbound: '接收记录',
        outbound: '发送记录',
        allProducts: '全部产品',
        noLogs: '暂无日志',
        apiComingSoon: 'API 接口即将上线'
      }
    }
  },

  // Footer
  footer: {
    tech: 'Cloudflare Worker · Next.js · D1 · Better Auth'
  },

  // Errors
  errors: {
    unauthorized: '未授权访问',
    forbidden: '无权限访问',
    notFound: '未找到',
    serverError: '服务器错误',
    networkError: '网络错误',
    unknownError: '未知错误'
  },

  // Search
  search: {
    title: '高级搜索',
    subtitle: '使用多条件筛选搜索工单',
    filters: '搜索条件',
    keyword: '关键词',
    keywordPlaceholder: '主题、内容、ID...',
    customerEmail: '客户邮箱',
    dateFrom: '开始日期',
    dateTo: '结束日期',
    results: '搜索结果',
    found: '条记录',
    noResults: '未找到符合条件的工单',
    subject: '主题',
    page: '第'
  },

  // ToC
  toc: {
    errors: {
      configurationError: '配置错误',
      missingCredentialsMessage: '访问此支持门户需要有效的凭证。请确保您的链接包含正确的产品 ID 和访问令牌。',
      contactProvider: '请联系您的服务提供商获取正确的访问链接。',
      technicalDetails: '技术详情'
    },
    tabs: {
      submit: '提交工单',
      list: '我的工单'
    },
    submit: {
      title: '提交工单',
      template: '模板',
      selectTemplate: '选择模板',
      category: '分类',
      selectCategory: '选择分类',
      subject: '主题',
      subjectPlaceholder: '简要描述您的问题',
      content: '详细描述',
      contentPlaceholder: '请详细描述您遇到的问题'
    },
    list: {
      noTickets: '暂无工单',
      noTicketsHint: '提交工单后将显示在这里'
    },
    detail: {
      agentReply: '客服回复',
      replyPlaceholder: '输入您的回复...',
      ticketClosed: '此工单已关闭，无法继续回复。'
    }
  },

  // AI
  ai: {
    title: 'AI 配置',
    subtitle: '配置 AI 功能和知识库',
    tabs: {
      config: '配置',
      knowledge: '知识库',
      documents: '文档'
    },
    config: {
      taskType: '任务类型',
      provider: '服务商',
      model: '模型',
      apiKey: 'API 密钥',
      apiKeyPlaceholder: '输入 API 密钥',
      baseUrl: '自定义 API 地址',
      baseUrlPlaceholder: 'https://api.example.com/v1',
      enabled: '启用',
      save: '保存配置',
      delete: '删除配置',
      noConfig: '暂无 AI 配置',
      addConfig: '添加配置',
      taskTypes: {
        agent: 'AI 助手',
        prescreening: '工单预审',
        prereply: '预回复生成',
        embedding: '向量嵌入'
      },
      providers: {
        openai: 'OpenAI',
        anthropic: 'Anthropic',
        google: 'Google AI',
        xai: 'xAI (Grok)',
        deepseek: 'DeepSeek'
      }
    },
    knowledge: {
      title: '知识库',
      add: '添加知识',
      edit: '编辑知识',
      titleLabel: '标题',
      titlePlaceholder: '知识条目标题',
      content: '内容',
      contentPlaceholder: '知识内容...',
      type: '类型',
      types: {
        description: '产品描述',
        faq: '常见问题',
        feature: '功能说明',
        policy: '政策条款',
        troubleshooting: '故障排除'
      },
      noKnowledge: '暂无知识条目',
      reembed: '重新生成向量',
      embedded: '已向量化',
      notEmbedded: '未向量化'
    },
    documents: {
      title: '文档管理',
      upload: '上传文档',
      uploadHint: '支持 PDF、TXT、MD、DOC、DOCX 格式',
      filename: '文件名',
      size: '大小',
      status: '状态',
      statuses: {
        pending: '待处理',
        processing: '处理中',
        ready: '就绪',
        error: '错误'
      },
      noDocuments: '暂无文档',
      reprocess: '重新处理',
      delete: '删除'
    },
    chat: {
      title: 'AI 助手',
      placeholder: '输入问题...',
      send: '发送',
      clear: '清空对话',
      thinking: '思考中...'
    }
  }
};

export type Translations = typeof zh;
