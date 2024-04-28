import * as fs from "node:fs";
import {it, expect, test, beforeEach,describe } from 'vitest'
import {MembraceDb} from "./index";
import exp from "constants";
import { persistence } from "./decorators";

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
        let miniDb = new MembraceDb("db", {root: createSampleObjectGraphForJson()});
        miniDb.close();

        let miniDb2 = new MembraceDb("db");
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
        let miniDb = new MembraceDb();
        try {
            expect(() => new MembraceDb()).toThrow(/locked/);
        }
        finally {
            miniDb.close();
        }
  });
});

describe("persistence decorator", () => {
  it("should not persist non-persistent fields", () => {
    class Test {
      @persistence({ persist: false })
      nonPersist = 123;
      persist = "random value";
    }

    const myObject = new Test();

    const db1 = new MembraceDb("./db", {
      root: myObject,
      classes: [Test],
    });

    myObject.persist = "NEW VALUE";
    myObject.nonPersist = 1234;

    db1.close();

    const db2 = new MembraceDb("./db", {
      classes: [Test],
    });

    expect((db2.root as any).persist).toBe("NEW VALUE");
    expect((db2.root as any).nonPersist).toBe(123);
    db2.close();
  });
});
