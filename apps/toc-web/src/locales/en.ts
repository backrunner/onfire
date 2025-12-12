import type { Translations } from './zh';

export const en: Translations = {
  // Common
  common: {
    loading: 'Loading...',
    submit: 'Submit',
    cancel: 'Cancel',
    send: 'Send',
    refresh: 'Refresh',
    close: 'Close',
    back: 'Back',
    required: 'Required',
    system: 'System'
  },

  // Header
  header: {
    title: 'Support Center',
    subtitle: 'OnFire Ticket System',
    newTicket: 'New Ticket',
    myTickets: 'My Tickets'
  },

  // Identity Card
  identity: {
    title: 'Identity',
    verified: 'JWT Verified',
    product: 'Product',
    email: 'Email',
    externalId: 'User ID',
    level: 'Level'
  },

  // Ticket Form
  form: {
    selectTemplate: 'Select Ticket Type',
    selectTemplatePlaceholder: 'Please select...',
    category: 'Category',
    selectCategoryPlaceholder: 'Select category',
    subcategory: 'Subcategory',
    selectSubcategoryPlaceholder: 'Select subcategory',
    submitTicket: 'Submit Ticket',
    submitting: 'Submitting...',
    submitSuccess: 'Submitted successfully! Our team will respond soon.',
    submitFailed: 'Submission failed, please try again later',
    verification: 'Verification'
  },

  // Error states
  error: {
    configError: 'Configuration Error',
    missingProductId: 'Missing product ID (productId). Please ensure a valid product identifier is provided via JWT token or URL parameter.',
    urlExample: 'Example URL format:',
    noTemplate: 'No template configured for this product. Please contact admin.'
  },

  // Form defaults
  defaults: {
    detailLabel: 'Issue Details',
    detailPlaceholder: 'Please describe the issue, steps, and expected outcome in detail',
    untitledTicket: 'Untitled Ticket',
    noContent: 'No details provided'
  },

  // Footer
  footer: {
    copyright: '© {{year}} OnFire · Modern Ticket System'
  },

  // Tickets List
  tickets: {
    title: 'My Tickets',
    total: 'Total Tickets',
    totalHint: 'Total tickets submitted by me',
    pending: 'Pending',
    pendingHint: 'Waiting for support',
    replied: 'Replied',
    repliedHint: 'Support has replied',
    noTickets: 'No tickets',
    filters: {
      allStatus: 'All Status',
      new: 'New',
      processing: 'Processing',
      replied: 'Replied',
      escalated: 'Escalated',
      closed: 'Closed'
    },
    sort: {
      recent: 'By Updated Time',
      priority: 'By Priority'
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
    slaWarning: 'SLA Breached'
  },

  // Ticket Detail
  detail: {
    selectTicket: 'Select a ticket to view details',
    content: 'Description',
    team: 'Team',
    product: 'Product',
    level: 'Level',
    history: 'Activity History',
    replies: 'Replies',
    noReplies: 'No replies yet',
    replyForm: 'Add Reply',
    replyPlaceholder: 'Enter your reply...',
    sendReply: 'Send',
    internal: 'Internal',
    turnstileRequired: 'Please complete verification before submitting',
    replyFailed: 'Failed to send reply, please try again later'
  },

  // Time
  time: {
    justNow: 'Just now',
    minutesAgo: '{{count}} min ago',
    hoursAgo: '{{count}}h ago',
    daysAgo: '{{count}}d ago'
  }
};
