import { ref, reactive } from 'vue';

// 创建全局状态管理
const isLoggedIn = ref(false);
const userInfo = reactive({
  username: '',
  userId: '',
  email: ''
});

// 登录函数
const login = (username, password, rememberMe = false) => {
  // 这里可以添加实际的登录逻辑，比如API调用
  console.log('登录信息:', { username, password, rememberMe });
  
  // 模拟登录成功
  isLoggedIn.value = true;
  userInfo.username = username;
  userInfo.userId = '123'; // 模拟用户ID
  userInfo.email = `${username}@example.com`; // 模拟邮箱
  
  // 如果勾选了记住我，可以将登录信息存储到localStorage
  if (rememberMe) {
    localStorage.setItem('bohUserInfo', JSON.stringify({
      username: userInfo.username,
      userId: userInfo.userId,
      email: userInfo.email
    }));
  }
  
  return true;
};

// 登出函数
const logout = () => {
  isLoggedIn.value = false;
  userInfo.username = '';
  userInfo.userId = '';
  userInfo.email = '';
  
  // 清除localStorage中的登录信息
  localStorage.removeItem('bohUserInfo');
};

// 初始化登录状态
const initLoginState = () => {
  // 从localStorage中获取登录信息
  const savedUserInfo = localStorage.getItem('bohUserInfo');
  if (savedUserInfo) {
    try {
      const userData = JSON.parse(savedUserInfo);
      isLoggedIn.value = true;
      userInfo.username = userData.username;
      userInfo.userId = userData.userId;
      userInfo.email = userData.email;
    } catch (error) {
      console.error('解析用户信息失败:', error);
      localStorage.removeItem('bohUserInfo');
    }
  }
};

// 导出状态和方法
export {
  isLoggedIn,
  userInfo,
  login,
  logout,
  initLoginState
};