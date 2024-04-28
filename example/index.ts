import {MembraceDb, persistence} from "membrace-db";


const generateID = () => Math.ceil(Math.random() * 10000);

class User {
    id: number = generateID();

    @persistence({/* options */}) // Within classes, you also have some options here, like non-persistent/transient fields. Use IntelliSense.
    name: string

    constructor(name?: string) { // Note: the parameter `name` is optional. You must give MembraceDb the chance to call the constructor with **no arguments** when it restores from disk.
        this.name = name!;
    }
}

class ApplicationData {
    users: User[] = []
    currentComment = "Hello"
}

const db = new MembraceDb<ApplicationData>("./db", {
    root: new ApplicationData(), // Initial content
    classes: [ApplicationData, User] // All your classes must be registed here, so MembraceDb knows, how to restore them from disk.
});

db.root.users.push(new User("Andrej")); // somehow modify data (as usual)

db.writeToDisk()