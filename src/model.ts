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

 export class File {
    name: string;
    description: string;
    type: FileType;
    parent: Directory;
    onGetData: () => string | ArrayBuffer;
    onSetData: (data: string | ArrayBuffer) => void;
    get data(): string | ArrayBuffer { return this.getData(); };
    constructor(name: string, type: FileType = FileType.Unknown) {
        this.name = name;
        this.type = type;
    }
    getData(): string | ArrayBuffer { return this.onGetData(); }
    setData(data: string | ArrayBuffer) { this.onSetData(data); }
}

export class Directory extends File {
    constructor(name: string) {
        super(name);
    }
    newFile(name: string, type: FileType): File {
        return null;
    }
    addFile(file: File) {

    }
}

export class Project extends Directory {
    constructor() {
        super("Project");
    }
}

export enum FileType {
    JavaScript = "javascript",
    TypeScript = "typescript",
    HTML       = "html",
    CSS        = "css",
    C          = "c",
    Cpp        = "cpp",
    Rust       = "rust",
    Wat       = "wat",
    Wasm       = "wasm",
    Directory  = "directory",
    Log        = "log",
    x86        = "x86",
    Markdown   = "markdown",
    Cretonne   = "cretonne",
    JSON       = "json",
    Unknown    = "unknown"
}

export interface Problem {

}