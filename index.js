const express = require("express");
const cors = require("cors");
require('dotenv').config();

const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");

const port = process.env.PORT || 3000;
// middleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gwyrdqg.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
app.get("/", (req, res) => {
  res.send("Welcome to Laxius Decor");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
        const db = client.db('laxius_decor');
        const userCollections = db.collection('users');

        // user related API's
        app.post('/users', async(req, res)=>{
            const user = req.body;
            user.role = 'user';
            user.createdAt = new Date();
            const email = user.email;
         const userExists = await userCollections.findOne({email});
          if(userExists){
        return res.send({message: 'user already exists'})
      }
      const result = await userCollections.insertOne(user);
      res.send(result);


        })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Laxius decor in running on port: ${port}`);
});
