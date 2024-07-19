import _ from "underscore";
import fs from "node:fs";
import * as devalue from 'devalue';
import {parse as brilloutJsonParse} from "@brillout/json-serializer/parse"
import {stringify as brilloutJsonStringify} from "@brillout/json-serializer/stringify";
import {fixErrorForJest, visitReplace, VisitReplaceContext} from "./Util.js";
import lockFile from "proper-lockfile"
import { onExit } from 'signal-exit'
import "reflect-metadata";
export {persistence} from "./decorators.js";

type ConstructorWithNoArgs<T> = {
    new(): T
}

export class MembraceDb<T extends object> {
    static systemClasses: ConstructorWithNoArgs<unknown>[] = [Date]

    //***********************************************************************************************
    //***** Section: Properties (Configuration). Also each are listed in type MembraceDbOptions *********
    //***********************************************************************************************

    /**
     * Path where the database files are stored
     */
    path: string

    /**
     * You can specify a backup strategy
     *
     * Example:
     * <pre><code>
     * const db = new MembraceDb("./myDb", {keepBackups: {minAgeInMinutes: 15, maxAgeInDays: 30}});
     * </code></pre>
     * <p>
     * Undefined = don't keep backups
     * </p>
     */
    keepBackups?: {
        /**
         * Default: 30
         */
        minAgeInMinutes?: number

        /**
         * Maximum time, a backup is kept. Guaranteed to be no longer than that (privacy)
         */
        maxAgeInDays: number

        /**
         * I.e. when maxAge is one day and periodFactor is 2, then one yearly backup is kept, one half-yearly, one quarter-yearly, ...
         * Decrease it, to densen the backups
         * <p>
         * Default: 1.3
         * </p>
         */
        periodFactor?: number
    }

    /**
     * The db can wait this amount of time for writes, to write out all changes in one batch.
     * <p>
     *     Default: 60
     * </p>
     */
    maxWriteWaitInSeconds = 60

    /**
     * You can set initial values here, when specifying it in the constructor. These will also be pre-set when an existing db is loaded.
     */
    root: T = {} as T;

    /**
     * Register all classes here, that should be able to be saved and restored. On a restore, an instance is created and then all the properties from the db are applied.
     */
    classes: ConstructorWithNoArgs<unknown>[] = []

    /**
     * Beatify the file (halfes performance)
     * @private
     */
    beautify = true;

    /**
     * Verify the integrity of the json after each write (halfes performance)
     */
    public verify = true;

    /**
     * Use "devalue", if you want to store circular references. But the result is not very readable then.
     */
    format: "brilloutJson" | "devalue" = "brilloutJson"

    //***********************************************************************************************
    //***** Section: State  *************************************************************************
    //***********************************************************************************************

    state: "open" | "closed" | Error

    /**
     * Error, when there was an error last time
     */
    writeToDiskTimer?: NodeJS.Timeout | Error

    /**
     *
     * @param path
     * @param options
     */
    constructor(path = "./db", options?: MembraceDbOptions<T>) {
        // Settings:
        this.path = path;
        _.extend(this, options || {});

        this.ensureFolderExists();

        // Make sure, no other process is using this db:
        try {
            this.lock();
        }
        catch (e) {
            throw new Error(`Cannot open database in ${this.path} because it is opened/locked by another Node.js/MembraceDb process: ${(e as Error)?.message}`);
        }

        const dbFile = `${path}/db.json`

        // Remove old db.next.json:
        const nextFile = `${path}/db.next.json`
        if(fs.existsSync(nextFile)) {
            fs.rmSync(nextFile, {force: true, recursive: false});
        }

        // Recover, if Db crashed before swap:
        const prevPath = `${path}/db.previous.json`
        if(fs.existsSync(prevPath)) {
            fs.renameSync(prevPath, dbFile);
        }

        if(fs.existsSync(dbFile))  {
            // Load from file:
            const data = fs.readFileSync(dbFile);
            const loaded = this.deserializeFromJson(data.toString("utf8"));
            if(typeof loaded !== "object") {
                throw new Error(`Content of ${dbFile} is not an object.`)
            }

            this.root = loaded
        }

        this.state = "open"

        // Attempt to write unsafed data before the process is killed:
        onExit((code, signal) => {
           this.close();
        });

        this.consolidateBackups();
    }

    private lock() {
        // lockFile.lockSync needs a file that exists. We could just give it this.path, i.e. "db" but then the .lock file would be placed next to it and this is not convenient, cause everyone would have to gitignore that file.
        const dummyFile = `${this.path}/db`;
        if(!fs.existsSync(dummyFile)) {
            fs.appendFileSync(dummyFile, "");
        }

        try {
            lockFile.lockSync(dummyFile, {update: 10000});
        }
        finally {
            // Clean up:
            if(fs.existsSync(dummyFile)) {
                fs.unlinkSync(dummyFile);
            }
        }
    }

    /**
     * Release the lock
     * @private
     */
    private unlock() {
        lockFile.unlockSync(this.path);
    }


    markChanged_firstTime = true;

    /**
     * Informs this db that the content (deep inside root) has changed. It will soon write it to disk.
     * @see MembraceDb#maxWriteWaitInSeconds
     */
    markChanged() {
        this.checkIsOpen();

        if(this.markChanged_firstTime) {
            // Write immediately, to provoke errors early
            this.writeToDisk()
            this.markChanged_firstTime = false;
        }

        if(this.maxWriteWaitInSeconds === 0) {
            this.writeToDisk();
            return;
        }

        if(this.writeToDiskTimer instanceof Error) { // Last one errored ?
            this.writeToDisk(); // Try again immediately (this would provoke the error again)
            this.writeToDiskTimer = undefined;
            return;
        }

        if(this.writeToDiskTimer) { // Already timed ?
            return;
        }

        // Call writeToDisk delayed:
        this.writeToDiskTimer = setTimeout(() => {
            try {
                this.writeToDisk();
                this.writeToDiskTimer = undefined;
            }
            catch (e) {
                this.writeToDiskTimer = e as Error;
            }
        }, this.maxWriteWaitInSeconds * 1000)
    }

    /**
     * Write the content to disk (the complete object graph under root)
     */
    writeToDisk() {
        this.checkIsOpen();
        const jsonString = this.serializeToJson(this.root);
        
        if(this.verify) {
            const reloaded = this.deserializeFromJson(jsonString);
            const normalize = (root: T) => {
                root = structuredClone(root);
                return this.serialize_removeNonPersistentFields(root);
            }
            
            if (!_.isEqual(normalize(this.root), normalize(reloaded))) {
                throw new Error(
                    "Database content does not reload to the exact same value"
                );
            }
            
            // CHeck if it serialzes to the same vflue again:
            const reloaded_reSerialized = this.serializeToJson(reloaded);
            if(reloaded_reSerialized !== jsonString) {
                throw new Error("Verification failed. Please report this as a bug");
            }
        }

        this.ensureFolderExists();

        const dbFile = `${this.path}/db.json`;
        const nextFile = `${this.path}/db.next.json`

        fs.writeFileSync(nextFile, new Buffer(jsonString, "utf8"));

        // Swap:
        if(this.keepBackups && fs.existsSync(dbFile)) {
            // get creattion date:
            const stats = fs.statSync(dbFile);
            if (stats.ctimeMs <= 0) {
                throw new Error(`Could not get creation time of file ${dbFile}`)
            }
            const creationDate = new Date(stats.ctimeMs);

            // rename current to db.previous.json. Allows crash recovery
            const previousFile = `${this.path}/db.previous.json`
            fs.renameSync(dbFile, previousFile);

            fs.renameSync(nextFile, dbFile); // swap

            // Archive
            fs.renameSync(previousFile, `${this.path}/db_${creationDate.toISOString()}.json`)
            this.consolidateBackups();
        }
        else {
            fs.renameSync(nextFile, dbFile); // Just rename
        }
    }

    private ensureFolderExists() {
        if (!fs.existsSync(this.path)) {
            fs.mkdirSync(this.path); // Create db folder
        }
    }

    /**
     * Computes a map from / to name
     */
    get classesMap() {
        const result = {
            name2Class: new Map<string, ConstructorWithNoArgs<unknown>>(),
            class2name: new Map<ConstructorWithNoArgs<unknown>, string>()
        };

        [...MembraceDb.systemClasses, ...this.classes].forEach(clazz => {
            const className = clazz.name;

            // Check validity:
            if(result.name2Class.has(className)) {
                if(result.name2Class.get(className) === clazz) {
                    throw new Error(`Class is listed twice in the "classes" array: ${className}`);
                }
                throw new Error(`There are 2 classes with the same name in the "classes" array: ${className}`);
            }

            result.name2Class.set(className, clazz);
            result.class2name.set(clazz, className);
        })

        return result;
    }

    /**
     * Can have the side effect of added properties.
     * TODO: remove those afterwards;
     * TODO: + throw an error, if _constructorName was found in any object (could be crafted by an attacker)
     * @param value
     * @protected
     */
    protected serializeToJson(value: T): string {
        // Scan for class instances and add _constructorName property
        let foundSomeClassInstance = false;
        const classesMap = this.classesMap;
        value = visitReplace(value, (value, visitChilds, context) => {
            if(typeof value === "object" && value !== null && value.constructor !== undefined) { // Value is a class ?
                const clazz = value.constructor as ConstructorWithNoArgs<any>;
                if(!(clazz === Object || clazz === Array)) {
                    const className = classesMap.class2name.get(clazz);
                    if (!className) {
                        throw new Error(`Class "${clazz.name}" is not registered. The db can only be restored with class instance support, if all used classes are registerd. Please list that class in the MembraceDb#classes array (via options). The class was found under: root${context!.diagnosis_path}`)
                    }
                    // @ts-ignore
                    value._constructorName = className;

                    foundSomeClassInstance = true;
                }

            }

            return visitChilds(value, context)
        }, "onError");

        value = structuredClone(value); // Ok, this is rather a hack here, because it still follows into the memory which the user doesn't want
        value = this.serialize_removeNonPersistentFields(value);
        
        if(this.format === "devalue") {
            if(foundSomeClassInstance) {
                value = structuredClone(value); // This converts all class instances back to plain objects. Because devalue cannot store class instances
            }
            let result = devalue.stringify(value);
            if (this.beautify) {
                result = JSON.stringify(JSON.parse(result), null, 4);
            }
            return result;
        }
        else if(this.format === "brilloutJson") {
            try {
                return brilloutJsonStringify(value,{space: this.beautify?4:undefined});
            }
            catch (e) {
                if(e instanceof Error && e.message.startsWith("Converting circular structure to JSON")) {
                    //@ts-ignore when consumers don't compile with lib:["es2022.error"]
                    throw new Error(`Found circular structure, which is not supported with brilloutJson. To support it, you can set the MembraceDbOptions#format field/option to "devalue".`, {cause: e}) //;
                }
                throw e;
            }
        }
        else {
            throw new Error("Invalid format")
        }
    }

    /**
     * @param root
     */
    protected serialize_removeNonPersistentFields(root: T) {
        return visitReplace(root, (value, visitChilds, context) => {
            if (typeof value === "object" && value !== null && (value as any)._constructorName !== undefined) { // Value was a class ?
                const clazz = this.classesMap.name2Class.get((value as any)._constructorName);
                if(!clazz) {
                    throw new Error("Illegal state: class is not registered");
                }
                const keysWithMetadata = Reflect.getMetadataKeys(clazz);
                keysWithMetadata.forEach((k) => {
                    const data = Reflect.getMetadata(k, clazz);

                    const shouldBeExcluded = data.persist === false;

                    if (shouldBeExcluded) {
                        //@ts-ignore
                        delete value[k];
                    }
                });
            }
            return visitChilds(value, context);
        });
    }

    protected deserializeFromJson(json: string): T {
        let result: T;
        if(this.format === "devalue") {
            result = devalue.parse(json) as T;
        }
        else if(this.format === "brilloutJson") {
            result = brilloutJsonParse(json) as T;
        }
        else {
            throw new Error("Invalid format")
        }

        // Scan for _constructorName property and create a class instance
        const classesMap = this.classesMap;
        const replacedInstances = new Map<object, unknown>();
        result = visitReplace(result, (value, visitChilds, context) => {
            if(typeof value === "object" && value !== null && (value as any)._constructorName !== undefined) { // Value is a class ?
                const className = (value as any)._constructorName;
                const clazz = classesMap.name2Class.get(className);
                if (!clazz) {
                    throw new Error(`Cannot load db. Class "${className}" is not registered. Please list that class in the MembraceDb#classes array (via options). The class was found in the db file under: root${context!.diagnosis_path}`)
                }

                // Replace value with class instance:
                const existing = replacedInstances.get(value);
                if(existing !== undefined) {
                    return existing;
                }
                const result = new clazz(); // Instantiate
                replacedInstances.set(value, result); // Remember for next time

                _.extend(result, visitChilds(value, context));
                return result;
            }

            return visitChilds(value, context)
        }, "onError");

        return result;
    }


    protected consolidateBackups() {
        if(!fs.existsSync(this.path)) {
            return;
        }

        // Create allBackupFiles array:
        const allBackupFiles: Readonly<{
            ageMs: number,
            fileName: string
        }[]> = []
        const now = new Date();
        fs.readdirSync(this.path).forEach(fileName => {
            const match = /db_(.*)\.json/.exec(fileName);
            if(match) {
                const fileDate = new Date(match[1]);
                // @ts-ignore
                allBackupFiles.push({
                    ageMs: now.getTime() - fileDate.getTime(),
                    fileName: fileName
                })
            }
        })


        if(!this.keepBackups) {
            // TODO: delete all-
            return;
        }

        // *** collect filesToKeep and delete all others: ****
        const filesToKeep = new Set<string>();
        // Defaults:
        const minAgeInMinutes = this.keepBackups.minAgeInMinutes || 30;
        const periodFactor = this.keepBackups.periodFactor || 1.3;
        // Sort with incrasing age
        const backupFilesForIteration = [...allBackupFiles]
        backupFilesForIteration.sort((a,b) => a.ageMs - b.ageMs);

        if(backupFilesForIteration.length === 0) {
            return;
        }

        let oldestFile = backupFilesForIteration.pop()!;

        for(let periodMs = (this.keepBackups.maxAgeInDays * 24 * 60 * 60 * 1000); periodMs > (minAgeInMinutes * 60 * 1000) ; periodMs /=  periodFactor) { // Iterate periods (like described in the this.keepBackups.periodFactor options)
            // Pop out all files that are older than periodMs:
            while (oldestFile && oldestFile.ageMs > periodMs) {
                oldestFile = backupFilesForIteration.pop()!;
            }

            if(!oldestFile) { // no more files ?
                break;
            }

            filesToKeep.add(oldestFile.fileName);
        }

        // Delete all except the files to keep:
        allBackupFiles.forEach(entry => {
            if(!filesToKeep.has(entry.fileName)) {
                fs.rmSync(`${this.path}/${entry.fileName}`)
            }
        })
    }

    protected checkIsOpen() {
        if(this.state === "open") {
            return;
        }
        else if(this.state === "closed") {
            throw new Error("MembraceDb has been closed.");
        }
        // Error ?
        //@ts-ignore when consumers don't compile with lib:["es2022.error"]
        throw fixErrorForJest(new Error(`MembraceDb failed fatally: ${this.state.message}, see cause`, {cause: this.state}))
    }

    close() {
        if(this.state === "closed") {
            return;
        }

        // Cancel this.writeToDiskTimer:
        if(this.writeToDiskTimer && !(this.writeToDiskTimer instanceof Error)) {
            clearTimeout(this.writeToDiskTimer);
            this.writeToDiskTimer = undefined;
        }

        this.writeToDisk();

        this.unlock();

        this.state = "closed";
    }
}

export type MembraceDbOptions<T extends object> = Partial<Pick<MembraceDb<T>, "root" | "classes" | "format" | "beautify" | "keepBackups" | "maxWriteWaitInSeconds">>