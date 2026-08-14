/** Web shell module loader global / 浏览器外壳模块加载器全局声明. */
export {}

declare global {
  interface Window {
    __ModuleLoader__: {
      load(entry: { id: string; factory: (require: (id: string) => unknown) => unknown }): void
    }
  }
}
