# MembraceDb
For Node.js

**Just give Minidb a root object and it will save it as json** (it's deep graph) and load it from disk next start.

That's the concept. So the main organization structure is just your objects in memory (at your fingertips) *yeah*. You don't have to think how to fit these into tables, meaning: No SQL, no ORM, no relations to configure, ...

Let's first have an honest look at the pro / cons of that concept so you can decide, if that fits into your range:
- Pro: Simple as hell.
- Pro: Reads are fast as hell, cause just taken from memory.
- Con: After each durable commit, the whole object graph needs to be written do disk. But i'm working on that towards change tracking with incremental writes. Currently you may be fine with periodic flushes to disk, like every  10 minutes, depending on the application.
- Con: Everything must fit into RAM. But that shouldn't be a problem in today's times where you can rent dedicated servers in the terrabyte range for reasonable prices. If you don't fit your highly webbed core business data into that, then i don't know what...
- Con: Your app is limted to one node (1 cpu core). Currently, this can still serve you roughly 100.000 requests per second via http to the client, if you tune your application well. I think, most applications can live with that very well.

So, the the concept looks promising and let's see how far we can drill up this concept to use that on a professional level *yeah* !

# Features

- Can persist **class instances** and restore them as such. MiniDb will tell you to register them.
- Can keep **backups**. With smart consolidation.
- **Atomic writes** (file swaps) and corruption checks.
- Supports data types **beyond json**: `undefined`, `Infinity`, `NaN`, `-0`, `Date`, `Map`, `Set`, `BigInt`, regular expressions, circular references. See the `serializer` option.
- Planned: Change tracking and **incremental saving**. This will lift it to a professional scale.
- Planned: Automatic schema migration. Will automacally inspect the typescript types via typescript-rtti, compare the difference and give you a template, how to write the proper migration method for that in your class.
   

# Install

````bash
npm install --save membrace-db
````

# Usage

````typescript
import {MiniDb, persistence} from "membrace-db";

const exampleDatabaseContent = {
    users: [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}],
    currentComment: "Hello",
}

// Create the database instance. All content will be saved to ./db/db.json:
const db = new MiniDb("./db", {
    root: exampleDatabaseContent, // This will be the first initial content, if no database file was created yet.
    // ... other options (use intellisense)
});

console.log(`Current db content is: ${db.root}`) // On the second run, you will also see Andrej here

db.root.users.push({id: 3, name: "Andrej"}) // Modify the data somehow.

db.writeToDisk() // Writes everything to disk immediately, blocking.

````



## Usage with class instances (OOP)
You like to program the OOP way ? You can store class instances and they will be restored on the next run.
Even your root object can be a class instance (class `ApplicationData` here):

````typescript
import {MiniDb, persistence} from "membrace-db";

class User {
    id: number = generateID();
    
    @persistence({/* options */}) // Within classes, you also have some options here, like non-persistent/transient fields. Use IntelliSense.
    name: string

    constructor(name?: string) { // Note: the parameter `name` is optional. You must give MiniDb the chance to call the constructor with **no arguments** when it restores from disk.
        this.name = name;
    }
}

class ApplicationData {
  users: User[] = []
  currentComment = "Hello"
}

const db = new MiniDb("./db", {
  root: new ApplicationData(), // Initial content
  classes: [ApplicationData, User] // All your classes must be registed here, so miniDb knows, how to restore them from disk.  
});


root.users.push(new User("Andrej")); // somehow modify data (as usual)

db.writeToDisk()

````


## Performance: Write to disk only occasionally:
As an alternative to `db.writeToDisk()`, like in a webserver where you have lots of small write events, you could instead do:
````typescript
db.markChanged() // Informs the db, that the content (deep inside root) has changed. It will soon write it to disk.
````

See the `maxWriteWaitInSeconds` option.