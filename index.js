const express = require("express");
const cors = require("cors");
require('dotenv').config();
const  admin = require("firebase-admin");

const  serviceAccount = require("./laxius_decor_firebase_adminsdk_key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
        const serviceCollections = db.collection('services');

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

        app.get('/users/:email/role', async(req, res)=>{
      const email = req.params.email;
      const query = {email};
      const user = await userCollections.findOne(query);
      res.send({role: user?.role || 'user'})
    })
  
    // services related API's
    app.get('/services', async(req, res)=>{
      try {
           const search = req.query.search || "";
      const category = req.query.category || "";
      let min =   parseInt(req.query.min);
      let max =   parseInt(req.query.max);
      if(isNaN(min)){
        return min = 0;
      }
      if(isNaN(max)){
        return max = 9999999;
      }
      let query = {
        cost: {$gte: min, $lte: max}
      };
      if(search){
        query.service_name = {$regex: search, $options: 'i'};
      }
      if(category){
        query.service_category = category;
      }
      const result = await serviceCollections.find(query).toArray();
      res.send(result);
        
      } catch (error) {
        console.log(error);
        res.status(500).send({message: 'Server error'});
        
      }
   
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
