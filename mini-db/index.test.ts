import * as fs from "node:fs";
import {it, expect, test, beforeEach,describe } from 'vitest'
import {MiniDb} from "./index";


beforeEach(() => {
    if(fs.existsSync("db")) {
        fs.rmdirSync("db");
    }
});

describe('db locking', () => {
    it("should not be allowed to open a locked db", () => {
        let miniDb = new MiniDb();
        try {
            expect(() => new MiniDb()).toThrow(/locked/);
        }
        finally {
            miniDb.close();
        }
    })
})
