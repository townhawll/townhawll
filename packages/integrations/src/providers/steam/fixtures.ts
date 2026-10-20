export const instant = "2026-10-20T12:00:00.000Z";
export const windowsMinimum =
  "<strong>Minimum:</strong><br><ul><li><strong>OS *:</strong> Windows 10 64-bit</li><li><strong>Processor:</strong> Intel Core i5 or AMD Ryzen 3</li><li><strong>Memory:</strong> 8 GB RAM</li><li><strong>Graphics:</strong> NVIDIA GTX 1060 (6 GB VRAM)</li><li><strong>DirectX:</strong> Version 11</li><li><strong>Storage:</strong> 50 GB available space</li><li><strong>Additional Notes:</strong> SSD recommended</li><li><strong>Sound Card:</strong> Compatible audio device</li></ul>";
export const windowsRecommended =
  "<strong>Recommended:</strong><br><ul><li><strong>OS:</strong> Windows 11</li><li><strong>Processor:</strong> Intel Core i7</li><li><strong>Memory:</strong> 16 GB RAM</li><li><strong>Graphics:</strong> NVIDIA RTX 3070</li><li><strong>Storage:</strong> 65 GB available space</li></ul>";
export const app = {
  steam_appid: 620,
  type: "game",
  name: "Portal 2",
  platforms: { windows: true, mac: false, linux: true },
  pc_requirements: { minimum: windowsMinimum, recommended: windowsRecommended },
  mac_requirements: {
    minimum:
      "<p>Minimum:</p><p>OS: macOS 10.15</p><p>Processor: Intel Core Duo</p><p>Memory: 2 GB RAM</p><p>Storage: 500 MB available space</p>",
  },
  linux_requirements: {
    minimum:
      "Minimum:\nOS: Ubuntu 20.04\nCPU: Dual-core 2 GHz\nGraphics: OpenGL 3.0 GPU\nMemory: 4096 MB RAM\nStorage: 1.5 GB available space",
    recommended: "Recommended:\nOS: Ubuntu 22.04\nRAM: 8 GiB\nStorage: 2 GiB",
  },
};
