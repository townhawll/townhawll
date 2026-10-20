import { describe, expect, it } from "vitest";

import {
  capacityMb,
  parseSystemRequirement,
  requirementsText,
} from "./requirements.js";
import { windowsMinimum } from "./fixtures.js";

describe("Steam requirements text extraction", () => {
  it("decodes entities, keeps readable layout and preserves original HTML exactly", () => {
    const original =
      "<ul><li><b>Processor:</b> Intel &amp; AMD &#x2122;</li><li><b>Memory:</b> 8&nbsp;GB RAM</li></ul>";
    expect(requirementsText(original)).toBe(
      "Processor: Intel & AMD ™\nMemory: 8 GB RAM",
    );
    expect(parseSystemRequirement(original)).toMatchObject({
      cpu: "Intel & AMD ™",
      ramMb: 8192,
      originalText: original,
    });
  });
  it("does not execute or fetch embedded content and excludes script/style/hidden text", () => {
    const input =
      '<script>Memory: 900 GB RAM</script><style>Storage: 888 GB</style><div hidden>CPU: wrong</div><span aria-hidden="true">GPU: wrong</span><template>OS: wrong</template><svg><text>OS: wrong</text></svg><img src="https://invalid.example/image" onerror="attack()"><p>Memory: 8 GB RAM</p>';
    expect(requirementsText(input)).toBe("Memory: 8 GB RAM");
    expect(parseSystemRequirement(input)).toMatchObject({
      os: null,
      cpu: null,
      gpu: null,
      ramMb: 8192,
    });
  });
  it("keeps encoded markup as plain text without reparsing it as HTML", () => {
    const text = requirementsText(
      "<p>Notes: &lt;script&gt;example&lt;/script&gt;</p>",
    );
    expect(text).toBe("Notes: <script>example</script>");
  });
  it("handles malformed but recoverable list HTML", () => {
    expect(
      parseSystemRequirement(
        "<ul><li><b>Memory:</b>8 GB RAM<li><b>Storage:</b>20 GB available space",
      ),
    ).toMatchObject({ ramMb: 8192, storageMb: 20480 });
  });
  it.each([
    "",
    " \n\t",
    "<p></p>",
    "<b>Minimum:</b>",
    "<script>bad()</script>",
  ])("omits empty/heading-only requirements %j", (input) => {
    expect(parseSystemRequirement(input)).toBeNull();
  });
});

describe("Steam structured requirement parsing", () => {
  it("extracts labeled OS/CPU/GPU/RAM/storage/DirectX without confusing VRAM and RAM", () => {
    expect(parseSystemRequirement(windowsMinimum)).toMatchObject({
      os: "Windows 10 64-bit",
      cpu: "Intel Core i5 or AMD Ryzen 3",
      gpu: "NVIDIA GTX 1060 (6 GB VRAM)",
      ramMb: 8192,
      storageMb: 51200,
      directX: "Version 11",
      originalText: windowsMinimum,
    });
    expect(parseSystemRequirement(windowsMinimum)?.additionalNotes).toContain(
      "SSD recommended",
    );
    expect(parseSystemRequirement(windowsMinimum)?.additionalNotes).toContain(
      "Sound Card: Compatible audio device",
    );
  });
  it("retains readable unstructured specifications without guessing fields", () => {
    const result = parseSystemRequirement(
      "<p>A modern gaming PC. 8 GB might help. Requires a 64-bit processor.</p>",
    );
    expect(result).toMatchObject({
      os: null,
      cpu: null,
      gpu: null,
      ramMb: null,
      storageMb: null,
      directX: null,
      rawText:
        "A modern gaming PC. 8 GB might help. Requires a 64-bit processor.",
    });
  });
  it("preserves unknown/localized labels as notes", () => {
    const result = parseSystemRequirement(
      "Memoria: 8 GB\nGPU: Powerful GPU\nNetwork: Broadband Internet connection",
    );
    expect(result).toMatchObject({ ramMb: null, gpu: "Powerful GPU" });
    expect(result?.additionalNotes).toContain("Memoria: 8 GB");
    expect(result?.additionalNotes).toContain(
      "Network: Broadband Internet connection",
    );
  });
  it("accepts common field aliases and plain-text multiline values", () => {
    expect(
      parseSystemRequirement(
        "Operating System: Linux\nCPU: Intel Core i5\nor an equivalent AMD CPU\nVideo Card: Any supported GPU\nRAM: 1024 MB\nHard Drive: 2 GB",
      ),
    ).toMatchObject({
      os: "Linux",
      cpu: "Intel Core i5 or an equivalent AMD CPU",
      gpu: "Any supported GPU",
      ramMb: 1024,
      storageMb: 2048,
    });
  });
  it("does not mistake GPU memory or unlabelled storage amounts for system RAM", () => {
    const result = parseSystemRequirement(
      "Graphics: GeForce 4 GB VRAM\nVideo Memory: 4 GB\nStorage: 20 GB available space",
    );
    expect(result).toMatchObject({
      gpu: "GeForce 4 GB VRAM",
      ramMb: null,
      storageMb: 20480,
    });
  });
  it("leaves conflicting duplicate fields null while retaining their values", () => {
    const result = parseSystemRequirement(
      "Memory: 8 GB RAM\nMemory: 16 GB RAM\nCPU: Intel\nCPU: AMD",
    );
    expect(result).toMatchObject({ ramMb: null, cpu: null });
    expect(result?.additionalNotes).toContain("8 GB RAM");
    expect(result?.additionalNotes).toContain("Intel");
  });
  it("accepts identical repeated labels without manufacturing a conflict", () => {
    expect(
      parseSystemRequirement("Memory: 8 GB RAM\nRAM: 8 GB RAM")?.ramMb,
    ).toBe(8192);
  });
  it.each([
    "8 GB RAM or 16 GB",
    "8-16 GB RAM",
    "approximately 8 GB",
    "8192",
    "8 GB VRAM",
    "8 GB (16 GB recommended)",
    "8 GB RAM Storage: 20 GB",
  ])("retains uncertain memory %j without guessing", (value) => {
    const result = parseSystemRequirement(`Memory: ${value}`);
    expect(result?.ramMb).toBeNull();
    expect(result?.rawText).toContain(value);
    expect(result?.additionalNotes).toContain(value);
  });
});

describe("Steam capacity units", () => {
  it.each([
    ["512 MB", "ramMb", 512],
    ["8 GB RAM", "ramMb", 8192],
    ["1.5 GB", "storageMb", 1536],
    ["2 GiB", "ramMb", 2048],
    ["1024 MiB", "ramMb", 1024],
    ["1 TB available space", "storageMb", 1048576],
    ["1 TiB", "storageMb", 1048576],
    ["500 MB available space", "storageMb", 500],
    ["4 gb ram", "ramMb", 4096],
  ] as const)(
    "converts %s using the explicit PC binary convention",
    (input, field, expected) => {
      expect(capacityMb(input, field)).toBe(expected);
    },
  );
  it.each([
    "",
    "8",
    "1,5 GB",
    "8,192 MB",
    "8G",
    "8 GB or 16 GB",
    "-1 GB",
    "0 MB",
    "0.1 GB",
    "999999999999999 TB",
    "4 GB VRAM",
  ])("rejects ambiguous/out-of-range capacity %j", (input) => {
    expect(capacityMb(input, "ramMb")).toBeNull();
  });
  it("uses field-specific suffixes rather than global size matching", () => {
    expect(capacityMb("8 GB available space", "ramMb")).toBeNull();
    expect(capacityMb("8 GB RAM", "storageMb")).toBeNull();
  });
});
