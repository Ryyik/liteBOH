/**
 * 消息中心 Mock 数据
 * 用于本地测试修复后的消息中心逻辑
 */

// Mock 用户数据
export const mockUsers = [
  {
    id: 'user-001',
    username: '张三',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhangsan',
    email: 'zhangsan@example.com'
  },
  {
    id: 'user-002',
    username: '李四',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lisi',
    email: 'lisi@example.com'
  },
  {
    id: 'user-003',
    username: '王五',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wangwu',
    email: 'wangwu@example.com'
  },
  {
    id: 'system-user',
    username: '系统',
    avatar_url: null,
    email: 'system@boh.com'
  }
];

// Mock 通知数据
export const mockNotifications = [
  // 点赞通知
  {
    id: 'notif-001',
    recipient_id: 'user-001',
    sender_id: 'user-002',
    type: 'like',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5分钟前
    archived_at: null,
    post_id: 'post-001',
    comment_id: null,
    sender: mockUsers[1],
    post: {
      id: 'post-001',
      title: '测试帖子标题',
      body: '这是一条测试帖子的内容...',
      content: '这是一条测试帖子的完整内容，包含一些文本...'
    },
    comment: null
  },
  {
    id: 'notif-002',
    recipient_id: 'user-001',
    sender_id: 'user-003',
    type: 'like',
    status: 'read',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30分钟前
    archived_at: null,
    post_id: 'post-002',
    comment_id: null,
    sender: mockUsers[2],
    post: {
      id: 'post-002',
      title: '另一个测试帖子',
      body: '另一条测试帖子的内容...',
      content: '另一条测试帖子的完整内容...'
    },
    comment: null
  },
  // 评论通知
  {
    id: 'notif-003',
    recipient_id: 'user-001',
    sender_id: 'user-002',
    type: 'comment',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(), // 10分钟前
    archived_at: null,
    post_id: 'post-001',
    comment_id: 'comment-001',
    sender: mockUsers[1],
    post: {
      id: 'post-001',
      title: '测试帖子标题',
      body: '这是一条测试帖子的内容...',
      content: '这是一条测试帖子的完整内容...'
    },
    comment: {
      id: 'comment-001',
      content: '这是一条很棒的帖子！',
      parent_id: null,
      author_username: '李四'
    }
  },
  {
    id: 'notif-004',
    recipient_id: 'user-001',
    sender_id: 'user-003',
    type: 'comment',
    status: 'read',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1小时前
    archived_at: null,
    post_id: 'post-002',
    comment_id: 'comment-002',
    sender: mockUsers[2],
    post: {
      id: 'post-002',
      title: '另一个测试帖子',
      body: '另一条测试帖子的内容...',
      content: '另一条测试帖子的完整内容...'
    },
    comment: {
      id: 'comment-002',
      content: '同意你的观点！',
      parent_id: null,
      author_username: '王五'
    }
  },
  // 印象通知
  {
    id: 'notif-005',
    recipient_id: 'user-001',
    sender_id: 'user-002',
    type: 'impression',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15分钟前
    archived_at: null,
    post_id: null,
    comment_id: null,
    sender: mockUsers[1],
    post: null,
    comment: null,
    content: '张三是一个非常友善的人，总是乐于助人。'
  },
  // 系统通知
  {
    id: 'notif-006',
    recipient_id: 'user-001',
    sender_id: 'system-user',
    type: 'system',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(), // 20分钟前
    archived_at: null,
    post_id: null,
    comment_id: null,
    sender: mockUsers[3],
    post: null,
    comment: null,
    content: '系统维护通知：今晚10点将进行系统升级，届时服务可能暂时中断。'
  },
  // 中奖通知
  {
    id: 'notif-007',
    recipient_id: 'user-001',
    sender_id: 'system-user',
    type: 'lottery_win',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(), // 25分钟前
    archived_at: null,
    post_id: null,
    comment_id: null,
    sender: mockUsers[3],
    post: null,
    comment: null,
    content: '恭喜你在 BOH 抽奖活动中中奖啦！请前往消息中心查看详情。'
  },
  // 已归档通知
  {
    id: 'notif-008',
    recipient_id: 'user-001',
    sender_id: 'user-002',
    type: 'like',
    status: 'read',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2小时前
    archived_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1小时前归档
    post_id: 'post-003',
    comment_id: null,
    sender: mockUsers[1],
    post: {
      id: 'post-003',
      title: '已归档的帖子',
      body: '这是一条已归档的帖子...',
      content: '这是一条已归档的帖子的完整内容...'
    },
    comment: null
  },
  {
    id: 'notif-009',
    recipient_id: 'user-001',
    sender_id: 'user-003',
    type: 'comment',
    status: 'read',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3小时前
    archived_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(), // 1.5小时前归档
    post_id: 'post-004',
    comment_id: 'comment-003',
    sender: mockUsers[2],
    post: {
      id: 'post-004',
      title: '另一个已归档的帖子',
      body: '另一条已归档的帖子...',
      content: '另一条已归档的帖子的完整内容...'
    },
    comment: {
      id: 'comment-003',
      content: '这是一条已归档的评论',
      parent_id: null,
      author_username: '王五'
    }
  },
  // 自操作通知（自己点赞自己的帖子）
  {
    id: 'notif-010',
    recipient_id: 'user-001',
    sender_id: 'user-001',
    type: 'like',
    status: 'unread',
    created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(), // 3分钟前
    archived_at: null,
    post_id: 'post-005',
    comment_id: null,
    sender: mockUsers[0],
    post: {
      id: 'post-005',
      title: '我自己的帖子',
      body: '这是我自己的帖子...',
      content: '这是我自己的帖子的完整内容...'
    },
    comment: null
  }
];

// Mock API 响应
export const mockApiResponse = {
  getUserNotifications: {
    data: mockNotifications.filter(n => !n.archived_at),
    error: null,
    hasMore: false,
    nextCursor: null
  },
  getArchivedNotifications: {
    data: mockNotifications.filter(n => n.archived_at),
    error: null,
    hasMore: false,
    nextCursor: null
  },
  getUnreadNotificationCount: {
    count: mockNotifications.filter(n => n.status === 'unread' && !n.archived_at && n.sender_id !== n.recipient_id).length,
    notifCount: mockNotifications.filter(n => n.status === 'unread' && !n.archived_at && n.sender_id !== n.recipient_id).length,
    mailCount: 0,
    error: null
  },
  archiveNotification: {
    ok: true,
    error: null
  },
  unarchiveNotification: {
    ok: true,
    error: null
  },
  markNotificationAsRead: {
    ok: true,
    error: null
  },
  markAllNotificationsAsRead: {
    ok: true,
    error: null
  }
};

// Mock 实时订阅 payload
export const mockRealtimePayload = {
  INSERT: {
    new: {
      id: 'notif-011',
      recipient_id: 'user-001',
      sender_id: 'user-002',
      type: 'like',
      status: 'unread',
      created_at: new Date().toISOString(),
      archived_at: null,
      post_id: 'post-006',
      sender: mockUsers[1],
      post: {
        id: 'post-006',
        title: '新帖子',
        body: '这是一条新帖子...'
      }
    }
  },
  UPDATE: {
    new: {
      id: 'notif-001',
      recipient_id: 'user-001',
      sender_id: 'user-002',
      type: 'like',
      status: 'read',
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      archived_at: null,
      post_id: 'post-001'
    },
    old: {
      id: 'notif-001',
      recipient_id: 'user-001',
      sender_id: 'user-002',
      type: 'like',
      status: 'unread',
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      archived_at: null,
      post_id: 'post-001'
    }
  },
  DELETE: {
    old: {
      id: 'notif-001',
      recipient_id: 'user-001'
    }
  }
};

// Mock 错误场景
export const mockErrorScenarios = {
  networkError: {
    data: null,
    error: {
      message: '网络连接失败，请检查网络设置',
      code: 'NETWORK_ERROR'
    }
  },
  serverError: {
    data: null,
    error: {
      message: '服务器内部错误',
      code: 'INTERNAL_SERVER_ERROR',
      status: 500
    }
  },
  authError: {
    data: null,
    error: {
      message: '用户未登录或登录已过期',
      code: 'UNAUTHORIZED',
      status: 401
    }
  }
};

// Mock Supabase Realtime Channel
export class MockRealtimeChannel {
  constructor(name) {
    this.name = name;
    this.listeners = {};
    this.status = 'CLOSED';
  }

  on(event, filter, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push({ filter, callback });
    return this;
  }

  subscribe(callback) {
    this.status = 'SUBSCRIBED';
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 100);
    }
    return this;
  }

  unsubscribe() {
    this.status = 'CLOSED';
    return Promise.resolve();
  }

  // 模拟接收实时事件
  simulateEvent(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(({ callback }) => {
        callback(payload);
      });
    }
  }

  // 模拟连接状态变化
  simulateStatusChange(status) {
    this.status = status;
    if (this.listeners['system']) {
      this.listeners['system'].forEach(({ callback }) => {
        callback({ status });
      });
    }
  }
}

// Mock Supabase Client
export const mockSupabase = {
  channel: (name) => new MockRealtimeChannel(name),
  removeChannel: (channel) => {
    if (channel) {
      channel.unsubscribe();
    }
    return Promise.resolve();
  },
  from: (table) => ({
    select: () => Promise.resolve(mockApiResponse.getUserNotifications),
    update: () => Promise.resolve(mockApiResponse.archiveNotification),
    insert: () => Promise.resolve({ data: mockNotifications[0], error: null }),
    rpc: () => Promise.resolve(mockApiResponse.markNotificationAsRead)
  })
};

// 测试场景配置
export const testScenarios = {
  // 正常场景
  normal: {
    userId: 'user-001',
    notifications: mockNotifications.filter(n => !n.archived_at),
    unreadCount: mockApiResponse.getUnreadNotificationCount.count
  },
  // 空数据场景
  empty: {
    userId: 'user-001',
    notifications: [],
    unreadCount: 0
  },
  // 大量数据场景
  largeData: {
    userId: 'user-001',
    notifications: Array.from({ length: 100 }, (_, i) => ({
      id: `notif-${i}`,
      recipient_id: 'user-001',
      sender_id: `user-${i % 3}`,
      type: ['like', 'comment', 'impression'][i % 3],
      status: i % 10 === 0 ? 'unread' : 'read',
      created_at: new Date(Date.now() - 1000 * 60 * i).toISOString(),
      archived_at: null,
      sender: mockUsers[i % 3]
    })),
    unreadCount: 10
  },
  // 错误场景
  error: {
    userId: 'user-001',
    error: mockErrorScenarios.networkError
  }
};

// 辅助函数：生成随机通知
export function generateRandomNotification(userId, type = 'like') {
  const sender = mockUsers[Math.floor(Math.random() * 3)];
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    recipient_id: userId,
    sender_id: sender.id,
    type,
    status: 'unread',
    created_at: new Date().toISOString(),
    archived_at: null,
    sender,
    content: `这是一条${type}类型的测试通知`
  };
}

// 辅助函数：验证通知数据结构
export function validateNotificationStructure(notification) {
  const requiredFields = ['id', 'recipient_id', 'sender_id', 'type', 'status', 'created_at'];
  const missingFields = requiredFields.filter(field => !notification[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`通知缺少必需字段: ${missingFields.join(', ')}`);
  }
  
  return true;
}