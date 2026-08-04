const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("uvmAPI", {
  openLog: () => ipcRenderer.invoke("dialog:open-topology-log"),
  onOpenRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-log", listener);
    return () => ipcRenderer.removeListener("menu:open-log", listener);
  }
});
