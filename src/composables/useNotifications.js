import { ref, onMounted } from 'vue'

const isSupported = ref(false)
const isSubscribed = ref(false)
const permissionStatus = ref('default')
const isLoading = ref(false)
const error = ref(null)

const checkMobileSupport = () => {
  const ua = navigator.userAgent

  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isChrome = /Chrome/.test(ua)
  const isFirefox = /Firefox/.test(ua)

  if (isIOS) {
    const match = /OS (\d+)_(\d+)/i.exec(ua)
    const iOSVersion = match ? parseFloat(match[1] + '.' + match[2]) : 0

    if (iOSVersion < 16.4) {
      return {
        supported: false,
        reason: 'iOS 16.4 及以上版本才支持 Web Push 通知'
      }
    }

    if (!isSafari) {
      return {
        supported: false,
        reason: 'iOS 设备仅 Safari 浏览器支持 Web Push 通知'
      }
    }
  }

  if (isAndroid) {
    if (!isChrome && !isFirefox) {
      return {
        supported: false,
        reason: 'Android 设备推荐使用 Chrome 或 Firefox 浏览器'
      }
    }
  }

  return { supported: true }
}

const checkSupport = () => {
  const hasNotification = 'Notification' in window
  const hasServiceWorker = 'serviceWorker' in navigator
  const hasPushManager = 'PushManager' in window

  if (!hasNotification || !hasServiceWorker || !hasPushManager) {
    const mobileCheck = checkMobileSupport()
    if (!mobileCheck.supported) {
      isSupported.value = false
      error.value = mobileCheck.reason
      return false
    }

    isSupported.value = false
    error.value = '您的浏览器不支持推送通知'
    return false
  }

  const mobileCheck = checkMobileSupport()
  if (!mobileCheck.supported) {
    isSupported.value = false
    error.value = mobileCheck.reason
    return false
  }

  isSupported.value = true
  return true
}

const getPermissionStatus = () => {
  if ('Notification' in window) {
    permissionStatus.value = Notification.permission
    return permissionStatus.value
  }
  return 'denied'
}

const checkSubscription = async () => {
  try {
    const permission = Notification.permission
    isSubscribed.value = permission === 'granted'
    return isSubscribed.value
  } catch (e) {
    console.error('检查订阅状态失败:', e)
    return false
  }
}

const requestPermission = async () => {
  if (!isSupported.value) {
    return false
  }

  isLoading.value = true
  error.value = null

  try {
    const result = await Notification.requestPermission()
    console.log('Notification.requestPermission 结果:', result)
    permissionStatus.value = result
    isSubscribed.value = result === 'granted'

    return isSubscribed.value
  } catch (e) {
    console.error('请求通知权限失败:', e)
    error.value = '请求通知权限失败，请稍后重试'
    permissionStatus.value = Notification.permission
    isSubscribed.value = Notification.permission === 'granted'
    return isSubscribed.value
  } finally {
    isLoading.value = false
  }
}

const unsubscribe = async () => {
  isLoading.value = true
  error.value = null

  try {
    isSubscribed.value = false
    permissionStatus.value = 'default'
    return true
  } catch (e) {
    console.error('取消订阅失败:', e)
    error.value = '取消订阅失败，请稍后重试'
    return false
  } finally {
    isLoading.value = false
  }
}

export function useNotifications() {
  onMounted(async () => {
    checkSupport()
    getPermissionStatus()
    await checkSubscription()
  })

  return {
    isSupported,
    isSubscribed,
    permissionStatus,
    isLoading,
    error,
    requestPermission,
    unsubscribe,
    checkSubscription
  }
}
