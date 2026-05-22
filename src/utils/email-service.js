
// email-service.js
// 统一的邮件发送服务，用于处理礼物请求和其他相关邮件发送

/**
 * 发送礼物请求邮件
 * @param {Object} data - 邮件数据对象
 * @param {string} data.product - 产品名称/标题
 * @param {string} data.specifications - 规格/描述
 * @param {string} data.giftOptions - 礼物选项 (e.g., '许愿礼物', '无')
 * @param {string} data.paymentMethod - 支付方式
 * @param {string} data.paymentAmount - 支付金额
 * @param {string} data.deliveryMethod - 配送方式
 * @param {string} data.totalPrice - 总价
 * @param {string} data.giftMessage - 留言/内容
 * @param {string} data.buyerName - 用户名
 * @param {string} data.buyerRole - 用户角色
 * @param {boolean} data.isLoggedIn - 是否登录
 * @returns {Promise} - EmailJS 发送结果
 */
export const sendGiftEmail = async (data) => {
    // 默认值填充
    const templateParams = {
        product: data.product || '未指定',
        specifications: data.specifications || 'N/A',
        giftOptions: data.giftOptions || '无',
        paymentMethod: data.paymentMethod || '无',
        paymentAmount: data.paymentAmount || '0',
        deliveryMethod: data.deliveryMethod || '无',
        totalPrice: data.totalPrice || '0',
        giftMessage: data.giftMessage || '',

        // 用户信息
        buyerName: data.buyerName || '匿名用户',
        buyerRole: data.buyerRole || '普通用户',
        isLoggedIn: data.isLoggedIn ? '是' : '否',

        // 时间
        orderTime: new Date().toLocaleString('zh-CN')
    };

    try {
        const emailjs = await import("@emailjs/browser");
        const response = await emailjs.send(
            'service_gdxyox8',  // Service ID
            'template_phr7883', // Template ID
            templateParams,
            'uQpD2f1I9ywYks-SN' // User ID
        );
        return response;
    } catch (error) {
        console.error('Email sending failed:', error);
        throw error;
    }
};

/**
 * 发送周边结算邮件
 * @param {Object} data - 邮件数据对象
 * @param {string} data.userId - 用户ID
 * @param {string} data.orderTime - 订单时间
 * @param {Array} data.items - 商品列表
 * @param {string} data.totalPrice - 总价
 * @param {string} data.buyerName - 用户名
 * @param {string} data.buyerRole - 用户角色
 * @param {boolean} data.isLoggedIn - 是否登录
 * @param {string} data.contactType - 联系方式类型 (qq 或 vx)
 * @param {string} data.contactValue - 联系方式值
 * @returns {Promise} - EmailJS 发送结果
 */
export const sendMerchandiseSettlementEmail = async (data) => {
    // 格式化商品列表为字符串
    const productList = data.items && data.items.length > 0
        ? data.items.map(item => `${item.title} (${item.selectedSpecLabel}) x${item.quantity}`).join('\n- ')
        : '无商品';

    // 格式化联系方式
    const contactLabel = data.contactType === 'qq' ? 'QQ' : '微信';
    const contactInfo = data.contactType && data.contactValue
        ? `${contactLabel}: ${data.contactValue}`
        : '未提供';

    // 默认值填充
    const templateParams = {
        product: '方块之家周边订单',
        specifications: productList,
        giftOptions: '周边购物',
        paymentMethod: '待确认',
        paymentAmount: data.totalPrice || '0',
        deliveryMethod: '待确认',
        totalPrice: data.totalPrice || '0',
        giftMessage: `用户ID: ${data.userId || 'N/A'}\n时间: ${data.orderTime || new Date().toLocaleString('zh-CN')}\n联系方式: ${contactInfo}`,

        // 用户信息
        buyerName: data.buyerName || '匿名用户',
        buyerRole: data.buyerRole || '普通用户',
        isLoggedIn: data.isLoggedIn ? '是' : '否',

        // 时间
        orderTime: data.orderTime || new Date().toLocaleString('zh-CN')
    };

    try {
        const emailjs = await import("@emailjs/browser");
        const response = await emailjs.send(
            'service_gdxyox8',  // Service ID
            'template_phr7883', // Template ID
            templateParams,
            'uQpD2f1I9ywYks-SN' // User ID
        );
        return response;
    } catch (error) {
        console.error('Merchandise settlement email sending failed:', error);
        throw error;
    }
};
