import type { Translations } from './zh';

export const en: Translations = {
  // Common
  common: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    refresh: 'Refresh',
    search: 'Search',
    submit: 'Submit',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    copy: 'Copy',
    reset: 'Reset',
    enable: 'Enable',
    disable: 'Disable',
    required: 'Required',
    optional: 'Optional',
    actions: 'Actions',
    status: 'Status',
    priority: 'Priority',
    logout: 'Logout',
    login: 'Login',
    checkingLogin: 'Checking authentication...'
  },

  // Navigation
  nav: {
    dashboard: 'Dashboard',
    tickets: 'Tickets',
    account: 'Account',
    admin: 'Admin'
  },

  // Topbar
  topbar: {
    title: 'OnFire Support',
    searchPlaceholder: 'Search subject/ID',
    pending: 'Pending',
    overdue: 'Overdue',
    loggedIn: 'Logged in as {{email}}'
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Ticket system overview',
    stats: {
      pending: 'Pending Tickets',
      pendingHint: 'Waiting for processing',
      escalated: 'Escalated Tickets',
      escalatedHint: 'Requires senior support',
      overdue: 'Overdue Tickets',
      overdueHint: 'SLA breached',
      products: 'Products',
      productsHint: 'Current scope'
    },
    quickActions: 'Quick Actions',
    viewAllTickets: 'View All Tickets',
    viewOverdue: 'View Overdue',
    recentTickets: 'Recent Tickets',
    noTickets: 'No tickets',
    noTicketsHint: 'New tickets will appear here'
  },

  // Tickets
  tickets: {
    title: 'Ticket Management',
    subtitle: 'View and process customer tickets',
    filters: {
      allStatus: 'All Status',
      allPriority: 'All Priority',
      allTeam: 'All Teams',
      allProduct: 'All Products',
      overdueOnly: 'Overdue Only'
    },
    sort: {
      priority: 'By Priority',
      recent: 'By Time',
      overdue: 'By Overdue'
    },
    status: {
      new: 'New',
      processing: 'Processing',
      replied: 'Replied',
      escalated: 'Escalated',
      closed: 'Closed'
    },
    priority: {
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },
    list: {
      total: '{{count}} total',
      selected: '{{count}} selected',
      noTickets: 'No tickets',
      noTicketsHint: 'No tickets match the current filters'
    },
    detail: {
      title: 'Ticket Details',
      ticketId: 'Ticket ID',
      customer: 'Customer',
      product: 'Product',
      team: 'Team',
      assignee: 'Assignee',
      createdAt: 'Created',
      updatedAt: 'Updated',
      sla: 'SLA Status',
      slaBreached: 'SLA Breached',
      content: 'Description',
      metadata: 'Metadata',
      timeline: 'Timeline',
      replies: 'Replies',
      history: 'History',
      noReplies: 'No replies yet',
      internalNote: 'Internal Note'
    },
    actions: {
      reply: 'Reply',
      replyPlaceholder: 'Enter reply...',
      sendReply: 'Send Reply',
      assign: 'Assign',
      assignTo: 'Assign to',
      assignPlaceholder: 'Agent ID',
      reassign: 'Reassign',
      escalate: 'Escalate',
      escalateReason: 'Escalation Reason',
      escalatePlaceholder: 'Please explain the reason for escalation',
      close: 'Close Ticket',
      closeReason: 'Close Reason',
      closePlaceholder: 'Please explain the reason for closing',
      changePriority: 'Change Priority',
      priorityReason: 'Change Reason',
      priorityPlaceholder: 'Please explain the reason for change'
    },
    bulk: {
      assign: 'Bulk Assign',
      close: 'Bulk Close',
      assignTitle: 'Bulk Assign Tickets',
      closeTitle: 'Bulk Close Tickets',
      assignHint: 'Assign {{count}} selected tickets to an agent',
      closeHint: 'Close {{count}} selected tickets',
      defaultCloseReason: 'Bulk closure'
    },
    historyActions: {
      created: 'Ticket Created',
      assign: 'Assigned',
      bulk_assign: 'Bulk Assigned',
      status_change: 'Status Changed',
      bulk_status_change: 'Bulk Status Change',
      priority_change: 'Priority Changed',
      escalated: 'Escalated',
      closed: 'Closed',
      auto_closed: 'Auto Closed',
      agent_replied: 'Agent Replied',
      customer_replied: 'Customer Replied'
    }
  },

  // Account
  account: {
    title: 'Account Security',
    subtitle: 'Update your login password. Password recovery is not available, please keep it safe.',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm New Password',
    updatePassword: 'Update Password',
    passwordMismatch: 'New passwords do not match',
    passwordUpdated: 'Password updated, please use the new password next time',
    passwordUpdateFailed: 'Failed to update password, please check current password or try again later'
  },

  // Login
  login: {
    title: 'Welcome Back',
    subtitle: 'Sign in with your email and password',
    email: 'Email',
    emailPlaceholder: 'admin@example.com',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    securityVerify: 'Security Verification',
    noTurnstile: 'Turnstile not configured (VITE_TURNSTILE_SITE_KEY), skipping verification',
    loginFailed: 'Login failed, please check your credentials or try again later',
    turnstileError: 'Verification failed to load, please refresh the page',
    footer: 'OnFire · Modern Ticket System'
  },

  // Install
  install: {
    title: 'OnFire Setup Wizard',
    subtitle: 'This instance has not been initialized. Please create a super admin and configure the initial tenant.',
    adminAccountSection: 'Create Super Admin Account',
    adminEmail: 'Admin Email',
    adminEmailPlaceholder: 'admin@yourcompany.com',
    displayName: 'Display Name',
    displayNamePlaceholder: 'John Doe',
    displayNameHint: 'Optional, will use email prefix if empty',
    password: 'Password',
    passwordPlaceholder: 'Enter a secure password',
    confirmPassword: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter your password',
    tenantSection: 'Configure Initial Tenant',
    tenantName: 'Tenant Name',
    tenantNamePlaceholder: 'e.g. Acme Inc',
    tenantNameHint: 'At least one tenant is required during setup. You can add/edit more later.',
    passwordMinLength: 'At least 8 characters',
    passwordUppercase: 'Contains uppercase',
    passwordLowercase: 'Contains lowercase',
    passwordNumber: 'Contains number',
    passwordMatch: 'Passwords match',
    passwordMismatch: 'Passwords do not match',
    passwordInvalid: 'Password does not meet requirements',
    tenantRequired: 'Tenant name is required',
    installSuccess: 'Setup complete, entering the system...',
    installFailed: 'Setup failed, please check your input or try again later',
    finishInstall: 'Finish Setup'
  },

  // Management
  management: {
    title: 'System Management',
    subtitle: 'Manage tenants, products, teams, templates and users',
    perPage: 'per page',
    noAccess: 'No {{type}} management access',
    noData: 'No {{type}} data',

    tabs: {
      tenants: 'Tenants',
      products: 'Products',
      teams: 'Teams',
      templates: 'Templates',
      users: 'Users'
    },

    tenants: {
      create: 'New Tenant',
      namePlaceholder: 'Tenant name',
      nameRequired: 'Please enter tenant name',
      edit: 'Edit Tenant'
    },

    products: {
      create: 'New Product',
      namePlaceholder: 'Product name',
      nameRequired: 'Please enter product name',
      edit: 'Edit Product',
      sla: 'SLA (minutes)',
      slaHighAccept: 'High-Accept',
      slaHighReply: 'High-Reply',
      slaMediumAccept: 'Med-Accept',
      slaMediumReply: 'Med-Reply',
      slaLowAccept: 'Low-Accept',
      slaLowReply: 'Low-Reply',
      bindTeams: 'Bind Teams (comma-separated IDs)',
      bindTeamsPlaceholder: 'team-a,team-b'
    },

    teams: {
      create: 'New Team',
      namePlaceholder: 'Team name',
      nameRequired: 'Please enter team name',
      edit: 'Edit Team',
      allowReassign: 'Allow Reassign'
    },

    templates: {
      create: 'New Template',
      titlePlaceholder: 'Template title',
      titleRequired: 'Please fill in title and product ID',
      productIdPlaceholder: 'Product ID',
      categoriesPlaceholder: 'Categories (JSON array)',
      schemaLabel: 'Form Schema (JSON)',
      schemaPlaceholder: '{"fields":[...]}',
      jsonError: 'Please check JSON format of categories/schema',
      edit: 'Edit Template',
      formBuilder: 'Visual Form Builder',
      formBuilderHint: 'Add fields and generate Schema JSON',
      fieldLabel: 'Field Label',
      fieldKey: 'Field Key',
      fieldType: 'Type',
      fieldRequired: 'Required',
      fieldPlaceholder: 'Placeholder (optional)',
      fieldOptions: 'Options, one per line',
      addField: 'Add Field',
      saveChanges: 'Save Changes',
      cancelEdit: 'Cancel Edit',
      schemaPreview: 'Schema Preview',
      types: {
        text: 'Text',
        textarea: 'Textarea',
        number: 'Number',
        email: 'Email',
        select: 'Select'
      }
    },

    apiKeys: {
      title: 'Product API Key',
      productIdPlaceholder: 'Product ID',
      namePlaceholder: 'Key name',
      generate: 'Generate API Key',
      productIdRequired: 'Please enter product ID',
      newKeyHint: 'New API Key (visible only here)',
      noKeys: 'No keys',
      revoked: 'Revoked',
      rotate: 'Rotate',
      revoke: 'Revoke'
    },

    categoryRoutes: {
      title: 'Category Routes',
      productIdPlaceholder: 'Product ID',
      categoryPlaceholder: 'Category',
      subcategoryPlaceholder: 'Subcategory (optional)',
      teamIdPlaceholder: 'Team ID',
      addRoute: 'Add Route',
      noRoutes: 'No routes configured',
      edit: 'Edit Category Route',
      targetTeam: 'Target Team ID',
      change: 'Edit',
      delete: 'Delete'
    },

    users: {
      accounts: 'User Accounts',
      searchEmail: 'Search email...',
      editRole: 'Edit User Role',
      role: 'Role',
      selectRole: 'Select role',
      displayName: 'Display Name'
    },

    agents: {
      title: 'Agents / Levels',
      searchAgent: 'Search agents...',
      edit: 'Edit Agent',
      level: 'Level',
      active: 'Active',
      inactive: 'Inactive',
      teamIds: 'Team IDs (comma-separated)',
      teamIdsPlaceholder: 'team-a,team-b',
      displayName: 'Display Name',
      email: 'Email',
      avatarUrl: 'Avatar URL'
    },

    customers: {
      title: 'Customer Directory',
      searchCustomer: 'Search customer email...',
      tenant: 'Tenant',
      product: 'Product',
      externalId: 'External ID',
      level: 'Level'
    },

    deleteConfirm: {
      title: 'Confirm Delete',
      message: 'This action cannot be undone. Are you sure you want to delete "{{name}}"?',
      inputHint: 'Enter the name to confirm:'
    },

    email: {
      title: 'Email Configuration',
      subtitle: 'Configure email sending and receiving',
      config: {
        tab: 'Configuration',
        noConfig: 'No email configuration',
        addConfig: 'Add Configuration',
        testEmail: 'Test Email',
        sendTest: 'Send Test',
        testSuccess: 'Test email sent successfully! Message ID: {{messageId}}',
        testFailed: 'Test email failed',
        testEmailPlaceholder: 'your-email@example.com',
        inbound: 'Inbound Email',
        outbound: 'Outbound Email',
        enabled: 'Enabled',
        disabled: 'Disabled',
        provider: 'Provider',
        address: 'Email Address',
        aiFilter: 'AI Filter',
        aiFilterDesc: 'Use AI to filter spam and non-support emails',
        filterStrictness: 'Filter Strictness',
        strictnessLow: 'Low - More permissive',
        strictnessMedium: 'Medium - Balanced',
        strictnessHigh: 'High - More strict',
        sender: 'Sender',
        senderName: 'Sender Name',
        senderEmail: 'Sender Email',
        senderNamePlaceholder: 'Support Team',
        senderEmailPlaceholder: 'support@yourcompany.com',
        replyTo: 'Reply-To (Optional)',
        replyToPlaceholder: 'replies@yourcompany.com',
        webhookSecret: 'Webhook Secret',
        generateSecret: 'Generate',
        generateSecretConfirm: 'Generate a new webhook secret? The old secret will be invalidated.',
        secretGenerated: 'Webhook Secret Generated',
        secretMessage: 'Save this secret securely. It will not be shown again.',
        copySecret: 'Copy Secret',
        apiKey: 'API Key',
        apiKeyPlaceholder: 'Enter API key',
        smtp: {
          host: 'SMTP Host',
          hostPlaceholder: 'smtp.example.com',
          port: 'SMTP Port',
          portPlaceholder: '587',
          user: 'SMTP User',
          userPlaceholder: 'user@example.com',
          password: 'SMTP Password',
          passwordPlaceholder: 'Enter password'
        },
        inboundProvider: 'Inbound Provider',
        inboundAddress: 'Inbound Address',
        inboundAddressPlaceholder: 'support@yourcompany.com',
        outboundProvider: 'Outbound Provider',
        selectProduct: 'Select Product',
        productId: 'Product',
        productIdRequired: 'Please select a product',
        save: 'Save Configuration',
        saving: 'Saving...',
        deleteConfig: 'Delete Configuration',
        deleteConfigConfirm: 'Are you sure you want to delete this email configuration?'
      },
      templates: {
        tab: 'Templates',
        noTemplates: 'No custom templates. Using default templates.',
        addTemplate: 'Add Template',
        editTemplate: 'Edit Email Template',
        createTemplate: 'Create Email Template',
        templateType: 'Template Type',
        selectType: 'Select Type',
        subjectTemplate: 'Subject Template',
        subjectPlaceholder: '[Ticket #{{ticket_id}}] {{subject}}',
        bodyTemplate: 'Body Template (HTML)',
        bodyPlaceholder: 'Enter HTML template...',
        enabled: 'Enabled',
        loadDefault: 'Load Default Template',
        preview: 'Preview',
        source: 'Source',
        rendered: 'Rendered',
        types: {
          ticket_created: 'Ticket Created',
          ticket_replied: 'Ticket Replied',
          ticket_closed: 'Ticket Closed',
          ticket_escalated: 'Ticket Escalated'
        },
        variables: 'Available Variables',
        variablesHint: 'Use {{variable}} syntax in templates'
      },
      logs: {
        tab: 'Logs',
        inbound: 'Inbound Emails',
        outbound: 'Outbound Emails',
        allProducts: 'All Products',
        noLogs: 'No logs',
        apiComingSoon: 'API endpoint coming soon'
      }
    }
  },

  // Footer
  footer: {
    tech: 'Cloudflare Worker · Next.js · D1 · Better Auth'
  },

  // Errors
  errors: {
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
    notFound: 'Not found',
    serverError: 'Server error',
    networkError: 'Network error',
    unknownError: 'Unknown error'
  }
};
