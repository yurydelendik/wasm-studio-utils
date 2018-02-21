/* Copyright 2018 Mozilla Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { File, Project, Directory, FileType, Problem } from "./model";
import { decodeRestrictedBase64ToBytes } from "./util";
import getConfig from "./config";
import { isZlibData, decompressZlib } from "./zlib";
import fetch, { Headers } from "node-fetch";

declare var global: any;

declare interface BinaryenModule {
  optimize(): any;
  validate(): any;
  emitBinary(): ArrayBuffer;
  emitText(): string;
  emitAsmjs(): string;
}

declare var Binaryen: {
  readBinary(data: ArrayBuffer): BinaryenModule;
  parseText(data: string): BinaryenModule;
};

declare var capstone: {
  ARCH_X86: any;
  MODE_64: any;
  Cs: any;
};

declare var base64js: {
  toByteArray(base64: string): ArrayBuffer;
  fromByteArray(base64: ArrayBuffer): string;
};

declare var Module: ({ }) => any;
declare var define: any;
declare var showdown: {
  Converter: any;
  setFlavor: Function;
};

declare var wabt: {
  ready: Promise<any>
  readWasm: Function;
  parseWat: Function;
};

export enum Language {
  C = "c",
  Cpp = "cpp",
  Wat = "wat",
  Wasm = "wasm",
  Rust = "rust",
  Cretonne = "cton",
  x86 = "x86",
  Json = "json",
  JavaScript = "javascript",
  TypeScript = "typescript",
  Text = "text"
}

interface IFile {
  name: string;
  children: IFile[];
  type?: string;
  data?: string;
  description?: string;
}

export interface IServiceRequestTask {
  file: string;
  name: string;
  output: string;
  console: string;
  success: boolean;
}

export interface IServiceRequest {
  success: boolean;
  tasks: IServiceRequestTask[];
  output: string;
}

export enum ServiceTypes {
  Rustc,
  Service
}

export class Service {
  static async sendRequestJSON(content: Object, to: ServiceTypes): Promise<IServiceRequest> {
    const config = await getConfig();
    const url = to === ServiceTypes.Rustc ? config.rustc : config.serviceUrl;
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(content),
      headers: new (<any>Headers)({ "Content-Type": "application/json" })
    });

    return response.json();
  }

  static async sendRequest(content: string, to: ServiceTypes): Promise<IServiceRequest> {
    const config = await getConfig();
    const url = to === ServiceTypes.Rustc ? config.rustc : config.serviceUrl;

    const response = await fetch(url, {
      method: "POST",
      body: content,
      headers: new (<any>Headers)({ "Content-Type": "application/x-www-form-urlencoded" })
    });
    return response.json();
  }

  static async compileFile(file: File, from: Language, to: Language, options = ""): Promise<any> {
    const result = await Service.compile(file.getData(), from, to, options);
    if (!result.success) {
      throw new Error((result as any).message);
    }
    let data = decodeRestrictedBase64ToBytes(result.output);
    if (isZlibData(data)) {
      data = await decompressZlib(data);
    }
    return data;
  }

  static async compile(src: string | ArrayBuffer, from: Language, to: Language, options = ""): Promise<IServiceRequest> {
    if ((from === Language.C || from === Language.Cpp) && to === Language.Wasm) {
      const project = {
        output: "wasm",
        compress: true,
        files: [
          {
            type: from,
            name: "file." + from,
            options,
            src
          }
        ]
      };
      const input = encodeURIComponent(JSON.stringify(project)).replace("%20", "+");
      return this.sendRequest("input=" + input + "&action=build", ServiceTypes.Service);
    } else if (from === Language.Wasm && to === Language.x86) {
      const input = encodeURIComponent(base64js.fromByteArray(src as ArrayBuffer));
      return this.sendRequest("input=" + input + "&action=wasm2assembly&options=" + encodeURIComponent(options), ServiceTypes.Service);
    } else if (from === Language.Rust && to === Language.Wasm) {
      // TODO: Temporary until we integrate rustc into the service.
      return this.sendRequestJSON({ code: src }, ServiceTypes.Rustc);
    }
  }

  static async disassembleWasm(buffer: ArrayBuffer): Promise<string> {
    if (typeof wabt === "undefined") {
      await Service.lazyLoad("lib/libwabt.js");
    }
    const module = wabt.readWasm(buffer, { readDebugNames: true });
    if (true) {
      module.generateNames();
      module.applyNames();
    }
    return module.toText({ foldExprs: false, inlineExport: true });
  }

  static async disassembleWasmWithWabt(file: File) {
    const result = await Service.disassembleWasm(file.getData() as ArrayBuffer);
    const output = file.parent.newFile(file.name + ".wat", FileType.Wat);
    output.description = "Disassembled from " + file.name + " using Wabt.";
    output.setData(result);
  }

  static async assembleWat(wat: string): Promise<ArrayBuffer> {
    if (typeof wabt === "undefined") {
      await Service.lazyLoad("lib/libwabt.js");
    }
    const module = wabt.parseWat("test.wat", wat);
    module.resolveNames();
    module.validate();
    const binary = module.toBinary({ log: true, write_debug_names: true });
    return binary.buffer;
  }

  static async assembleWatWithWabt(file: File) {
    const result = await Service.assembleWat(file.getData() as string);
    const output = file.parent.newFile(file.name + ".wasm", FileType.Wasm);
    output.description = "Assembled from " + file.name + " using Wabt.";
    output.setData(result);
  }

  static async loadProject(json: any, project: Project): Promise<any> {
    async function deserialize(json: IFile | IFile[], basePath: string): Promise<any> {
      if (Array.isArray(json)) {
        return Promise.all(json.map((x: any) => deserialize(x, basePath)));
      }
      if (json.children) {
        const directory = new Directory(json.name);
        (await deserialize(json.children, basePath + "/" + json.name)).forEach((file: File) => {
          directory.addFile(file);
        });
        return directory;
      }
      const file = new File(json.name, json.type as FileType);
      file.description = json.description;
      if (json.data) {
        file.setData(json.data);
      } else if (json.data === null) {
        file.setData("");
      } else {
        const request = await fetch(basePath + "/" + json.name);
        file.setData(await request.text());
      }
      return file;
    }
    project.name = json.name;
    (await deserialize(json.children, "templates/" + json.directory)).forEach((file: File) => {
      project.addFile(file);
    });
    return json;
  }

  static lazyLoad(uri: string): Promise<any> {
    const baseUrl = "https://webassembly.studio/";
    let exports;
    switch (uri) {
      case "lib/libwabt.js":
        exports = ["wabt"];
        break;
      case "lib/showdown.min.js":
        exports = ["showdown"];
        break;
      case "lib/binaryen.js":
        exports = ["Binaryen"];
        break;
      default:
        throw new Error("Unknow lazyLoad uri: " + uri);
    }
    return fetch(baseUrl + uri).then(res => res.text()).then(res => {
      const code = new Function(res +
        '\nreturn [' + exports.join(',') + '];');
      const exportsObjs = code();
      exports.forEach((e, i) => global[e] = exportsObjs[i]); 
    });
  }

  static async disassembleWasmWithBinaryen(file: File) {
    if (typeof Binaryen === "undefined") {
      await Service.lazyLoad("lib/binaryen.js");
    }
    const data = file.getData() as ArrayBuffer;
    const module = Binaryen.readBinary(data);
    const output = file.parent.newFile(file.name + ".wat", FileType.Wat);
    output.description = "Disassembled from " + file.name + " using Binaryen.";
    output.setData(module.emitText());
  }

  static async convertWasmToAsmWithBinaryen(file: File) {
    if (typeof Binaryen === "undefined") {
      await Service.lazyLoad("lib/binaryen.js");
    }
    const data = file.getData() as ArrayBuffer;
    const module = Binaryen.readBinary(data);
    const result = module.emitAsmjs();
    const output = file.parent.newFile(file.name + ".asm.js", FileType.JavaScript);
    output.description = "Converted from " + file.name + " using Binaryen.";
    output.setData(result);
  }

  static async compileMarkdownToHtml(src: string): Promise<string> {
    if (typeof showdown === "undefined") {
      await Service.lazyLoad("lib/showdown.min.js");
    }
    const converter = new showdown.Converter({ tables: true });
    showdown.setFlavor("github");
    return converter.makeHtml(src);
  }
}
