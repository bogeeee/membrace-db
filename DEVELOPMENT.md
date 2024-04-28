### Prepare

```bash
git clone https://github.com/bogeeee/membrace-db.git
cd membrace-db/membrace-db
npm install --ignore-scripts
```


### Run the tests

`npm run tests`


### Run the example
- `cd example`
- Edit package.json to use the dev membrace-db (like in a monorepo but manually)
````json
"dependencies": {
   "membrace-db": "file:../membrace-db"
},
````
- `npm intall` to install packages and create the symlink to the dev membrace-db folder
- `npm run dev`