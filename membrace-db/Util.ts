import {stringify as brilloutJsonStringify} from "@brillout/json-serializer/stringify";
import * as fs from "node:fs";

export function diagnisis_shortenValue(value: any) : string {
    if(value === undefined) {
        return "undefined";
    }

    if(value === null) {
        return "null";
    }

    let objPrefix = "";
    if(typeof value == "object" && value.constructor?.name && value.constructor?.name !== "Object") {
        objPrefix = `class ${value.constructor?.name} `;
    }



    function shorten(value: string) {
        const MAX = 50;
        if (value.length > MAX) {
            return value.substring(0, MAX) + "..."
        }
        return value;
    }

    try {
        return shorten(objPrefix + brilloutJsonStringify(value));
    }
    catch (e) {
    }

    if(typeof value == "string") {
        return shorten(value)
    }
    else if(typeof value == "object") {
        return `${objPrefix}{...}`;
    }
    else {
        return "unknown"
    }

}


export function isDirectorySync(filePath: string) {
    const stats = fs.statSync(filePath);
    return stats.isDirectory();
}

// Add type
export const jsStringEscape = function (string: any) {
    // @ts-ignore
    return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
        // Escape all characters not included in SingleStringCharacters and
        // DoubleStringCharacters on
        // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
        switch (character) {
            case '"':
            case "'":
            case '\\':
                return '\\' + character
            // Four possible LineTerminator characters need to be escaped:
            case '\n':
                return '\\n'
            case '\r':
                return '\\r'
            case '\u2028':
                return '\\u2028'
            case '\u2029':
                return '\\u2029'
        }
    })
}




/**
 * Usage:
 *  <pre><code>
 *  const result = visitReplace(target, (value, visitChilds, context) => {
 *      return value === 'needle' ? 'replaced' : visitChilds(value, context)
 *  });
 *  </code></pre>
 *
 * @param value
 * @param visitor
 * @param trackContext whether to pass on the context object. This hurts performance because the path is concatted every time, so use it only when needed. Setting this to "onError" re-executes the visitprelace with the concetxt when an error was thrown
 */
export function visitReplace<O extends object>(value: O, visitor: ((value: unknown, visitChilds: (value: unknown, context?: VisitReplaceContext) => unknown, context?: VisitReplaceContext) => unknown ), trackContext: boolean | "onError" = false): O {
    const visisitedObjects = new Set<object>()

    function visitChilds(value: unknown, context?: VisitReplaceContext) {
        if(value === null) {
            return value;
        }
        else if(typeof value === "object") {
            const obj = value as object;
            if(visisitedObjects.has(obj)) {
                return value; // don't iterate again
            }
            visisitedObjects.add(obj);

            for (let k in obj) {
                const key = k as keyof object;
                const value = obj[key];
                let newValue = visitor(value, visitChilds, context?{...context, diagnosis_path: `${context.diagnosis_path}${diagnosis_jsonPath(key)}`}:undefined);
                if(newValue !== value) { // Only if value really has changed. We don't want to interfer with setting a readonly property and trigger a proxy
                    // @ts-ignore
                    obj[key] = newValue;
                }
            }
        }
        return value;
    }

    if(trackContext === "onError") {
        try {
            return visitor(value,  visitChilds) as O; // Fast try without context
        }
        catch (e) {
            return visitReplace(value,  visitor, true); // Try again with context
        }
    }

    return visitor(value, visitChilds,trackContext?{diagnosis_path: ""}:undefined) as O;
}

export type VisitReplaceContext = {
    /**
     * Not safely escaped. Should be used for diag only !
     */
    diagnosis_path: string
}

function diagnosis_jsonPath(key: unknown) {
    if(!Number.isNaN(Number(key))) {
        return `[${key}]`;
    }
    return `.${key}`;
}

/**
 * When running with jest, the cause is not displayed. This fixes it.
 * @param error
 */
export function fixErrorForJest(error: Error) {
    if(process.env.JEST_WORKER_ID !== undefined) { // Are we running with jest ?
        const cause = (error as any).cause;
        if(cause) {
            error.message = `${error.message}, cause: ${errorToString(cause)}\n*** end of cause ***`
        }
    }
    return error;
}

export function errorToString(e: any): string {
    // Handle other types:
    if (!e || typeof e !== "object") {
        return String(e);
    }
    if (!e.message) { // e is not an ErrorWithExtendedInfo ?
        return JSON.stringify(e);
    }
    e = <ErrorWithExtendedInfo>e;

    return (e.name ? `${e.name}: ` : "") + (e.message || String(e)) +
        (e.stack ? `\n${e.stack}` : '') +
        (e.fileName ? `\nFile: ${e.fileName}` : '') + (e.lineNumber ? `, Line: ${e.lineNumber}` : '') + (e.columnNumber ? `, Column: ${e.columnNumber}` : '') +
        (e.cause ? `\nCause: ${errorToString(e.cause)}` : '')
}


export type ErrorWithExtendedInfo = Error & { cause?: Error, fileName?: string, lineNumber?: Number, columnNumber?: Number, stack?: string };

/**
 * TODO: Beter function name. Eventually move to index.ts
 * @param object
 */
export function getPersistable<T extends Object>(object: T) {

    const persistableObject = structuredClone(object);
    const keysWithMetadata = Reflect.getMetadataKeys(object);
    keysWithMetadata.forEach((k) => {
      const data = Reflect.getMetadata(k, object);
        
        const shouldBeExcluded = data.persist === false;
        
        if (shouldBeExcluded) {
            //@ts-ignore
            delete persistableObject[k];
        }
    });
    
    return persistableObject;
}