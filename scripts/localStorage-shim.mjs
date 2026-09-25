// Node 环境下的 localStorage 最小实现，供 store 冒烟测试使用。
const map = new Map();
globalThis.localStorage = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key),
  clear: () => map.clear()
};
