# Mini Db
For Node.js

Just give Minidb a root object and it will save it as json (it's deep graph) and load it from disk next start.

That's the concept. So the main organization structure is just your objects in memory (at your fingertips) *yeah*. You don't have to think how to fit these into tables, meaning: No SQL, no ORM, no relations to configure, ...

Let's first have an honest look at the pro / cons of that concept so you can decide, if that fits into your range:
- Pro: Simple as hell.
- Pro: Reads are fast as hell, cause just taken from memory.
- Con: After each durable commit, the whole object graph needs to be written do disk. But i'm working on that towards change tracking with incremental writes. Currently you may be fine with periodic flushes to disk, like every  10 minutes, depending on the application.
- Con: Everything must fit into RAM. But that shouldn't be a problem in today's times where you can rent dedicated servers in the terrabyte range for reasonable prices. If you don't fit your highly webbed core business data into that, then i don't know what...
- Con: Your app is limted to one node (1 cpu core). Currently this can still serve you roughly 100.000 requests per second via http to the client, if you tune your application well.

So, the the concept looks promising and let's see how far we can drill up this concept to use that on a professional level *yeah* !

# Features

- Can persist class instances and restore them as such. MiniDb will tell you to register them.
- Can keep backups. With smart consolidation.
- Planned: Change tracking and **incremental** safe. This will lift it to a professional scale.
- Planned: Automatic schema migration. Will automacally inspect the typescript types via typescript-rtti, compare the difference and give a template, how to write the proper migration method for that in your class.
-   Note: The approach will be class centric here. So you'll have
