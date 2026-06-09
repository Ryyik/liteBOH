// Direct regex test
const re1 = /#search:([^\s#\u4e00-\u9fa5][^\n#\u4e00-\u9fa5]*?)(?=\s+#|$|\n)/g;
const text1 = '搜 #search:TODO 这关键词';
console.log('re1:', re1.exec(text1));

const re2 = /#search:([\w-]+)/g;
const text2 = '搜 #search:TODO 这关键词';
console.log('re2:', re2.exec(text2));

const re3 = /#search:([\u4e00-\u9fa5])/g;
const text3 = '搜 #search:TODO 这关键词';
console.log('re3:', re3.exec(text3));

// Try without the \u4e00-\u9fa5 part
const re4 = /#search:([^\s#][^\n#]*?)(?=\s+#|$|\n)/g;
console.log('re4:', re4.exec(text1));
