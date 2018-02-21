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

import { File, Directory, FileType, Project } from "./model";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { sep, extname } from "path";

interface CacheEntry {
    dir: Directory;
    children: any;
}

let project = new Project();
let dirsCache: CacheEntry = {
    dir: project,
    children: Object.create(null)
};

function stringOrBuffer(content: any, type: FileType): string | ArrayBuffer {
    switch (type) {
        case FileType.Wasm:
        case FileType.x86:
            return content;    
        default:
            return content.toString();
    }
}

function getTypeFromExtension(name: string): FileType {
    switch (extname(name)) {
        case ".wasm": return FileType.Wasm;
        case ".wat": return FileType.Wat;
        case ".c": return FileType.C;
        case ".cpp": return FileType.Cpp;
        case ".rs": return FileType.Rust;
        default: return FileType.Unknown;
    } 
}

export function newFile(path: string, type: FileType, isTransient: boolean = false): File {
    let p = path.split("/");
    let current: CacheEntry = dirsCache;
    let fullname = [];
    while (p.length > 1) {
        const name = p.shift();
        fullname.push(name);
        const entry = current.children[name];
        if (entry) {
            current = entry;
            continue;
        }
        const next = new Directory(name);
        next.parent = current.dir;
        current = current.children[name] = {
            dir: next,
            children: Object.create(null) 
        };
        if (!existsSync(fullname.join(sep))) {
            mkdirSync(fullname.join(sep))
        }
    }
    const [ filename ] = p;
    fullname.push(filename);
    const ospath = fullname.join(sep);

    const file = new File(filename, type);
    file.parent = current.dir;
    writeFileSync(ospath, "");
    file.onGetData = () => stringOrBuffer(readFileSync(ospath), type);
    file.onSetData = (data: string | ArrayBuffer) => writeFileSync(ospath, data);
    return file;
}

export function getFile(path: string): File {
    let p = path.split("/");
    let current: CacheEntry = dirsCache;
    let fullname = [];
    while (p.length > 1) {
        const name = p.shift();
        fullname.push(name);
        const entry = current.children[name];
        if (entry) {
            current = entry;
            continue;
        }
        if (!existsSync(fullname.join(sep))) {
            return null;
        }
        const next = new Directory(name);
        next.parent = current.dir;
        current = current.children[name] = {
            dir: next,
            children: Object.create(null) 
        };
    }
    const [ filename ] = p;
    fullname.push(filename);
    const ospath = fullname.join(sep);

    if (!existsSync(ospath)) {
        return null;
    }

    const type = getTypeFromExtension(filename);
    const file = new File(filename, type);
    file.parent = current.dir;
    file.onGetData = () => stringOrBuffer(readFileSync(ospath), type);
    file.onSetData = (data: string | ArrayBuffer) => writeFileSync(ospath, data);
    return file;
}
