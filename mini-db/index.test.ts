import * as fs from "node:fs";
import {it, expect, test, beforeEach,describe } from 'vitest'
import {MiniDb} from "./index";
import exp from "constants";


beforeEach(() => {
    // Clear folder:
    if(fs.existsSync("db")) {
        fs.rmdirSync("db", {recursive: true});
    }
});

function createSampleObjectGraphForJson() {
    return {
        appName: "HelloApp",
        users: [{id: 1, name: "Bob", active: true}, {id: 2, name: "Alice", active: false}],
        nullable: null,
    }
}


describe('Basic test', () => {
    it("should have the same graph when reopening", () => {
        let miniDb = new MiniDb("db", {root: createSampleObjectGraphForJson()});
        miniDb.close();


        let miniDb2 = new MiniDb("db");
        try {
            expect(miniDb2.root).toStrictEqual(createSampleObjectGraphForJson());
        }
        finally {
            miniDb2.close();
        }
    })

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
