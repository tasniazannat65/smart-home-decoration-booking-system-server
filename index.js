const express = require("express");
const cors = require("cors");
require('dotenv').config();
const  admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET);


const  serviceAccount = require("./laxius_decor_firebase_adminsdk_key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
const verifyJWTToken = async(req, res, next)=>{
  const token = req.headers.authorization;
  if(!token){
    return res.status(401).send({message: 'Unauthorized access'})
  }
  try{
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken)
    req.decoded_email = decoded.email;
    next();


  }
  catch(err){
      return res.status(401).send({message: 'Unauthorized access'})


  }

  
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
        const db = client.db('laxius_decor');
        const userCollections = db.collection('users');
        const serviceCollections = db.collection('services');
        const bookingCollections = db.collection('bookings');
        const paymentCollections = db.collection('payments');

        // role middleware
    //      const verifyAdmin = async(req, res, next)=>{
    //   const email = req.decoded_email;
    //   const query = {email};
    //   const user = await userCollections.findOne(query);
    //   if(!user || user.role !== 'admin'){
    //     res.status(403).send({message: 'forbidden access'})
    //   }


    //   next();

    // }
    // const verifyDecorator = async(req, res, next)=>{
    //   const email = req.decoded_email;
    //   const query = {email};
    //   const user = await userCollections.findOne(query);
    //   if(!user || user.role !== 'decorator'){
    //     res.status(403).send({message: 'forbidden access'})
    //   }


    //   next();

    // }


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
    app.get('/latest-services', async(req, res)=>{
      try {
        const query = {};
        const result = await serviceCollections.find(query).limit(6).toArray();
        res.send(result);
        
      } catch (error) {
        console.log(error)
        res.status(500).send({message: 'Server error'})
        
      }
    })

    app.get('/services/:id', async(req, res)=>{
      try {
         const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await serviceCollections.findOne(query);
      res.send(result);
        
      } catch (error) {
        console.log(error)
        res.status(500).send({message: 'Server error'})

        
      }
     
    })

    // bookings related API's

    app.post('/bookings', verifyJWTToken, async(req, res)=>{
      try {
        const bookingInfo = req.body;
        const result = await bookingCollections.insertOne(bookingInfo);
        res.send(result);
        
      } catch (error) {
         console.log(error)
        res.status(500).send({message: 'Booking failed'})

        
      }
      

    })

    app.get('/bookings', async(req, res)=>{
      try {
        const email = req.query.email;
        const result = await bookingCollections.find({userEmail: email}).sort({bookingDate: -1}).toArray();
        res.send(result);
        
      } catch (error) {
        console.log(error)
        res.status(500).send({message: 'Server error'})
        
      }
    })

    // payment related API's
     app.post('/payment-checkout-session', async(req, res)=>{
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        
        price_data: {
          currency: 'USD',
          unit_amount: amount,
          product_data: {
            images: [paymentInfo.image],
            name: `Please pay for: ${paymentInfo.serviceName}`

          }
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    metadata: {
      bookingId: paymentInfo.bookingId,
      serviceName: paymentInfo.serviceName
    },
    customer_email: paymentInfo.userEmail,
    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
  });
  res.send({url: session.url})
    })

     app.patch('/payment-success', async(req, res)=>{
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

     const transactionId = session.payment_intent;
     const paymentExist = await paymentCollections.findOne({transactionId});
     if(paymentExist){
      return res.send({message: 'Payment already recorded', transactionId
      })
     }



      if(session.payment_status === 'paid'){
        const bookingId = session.metadata.bookingId;
       const updateBooking = await bookingCollections.updateOne(
        {_id: new ObjectId(bookingId)},
        {
          $set: {
            paymentStatus: 'paid',
            paidAt: new Date()
          }
        }
       )

        const paymentInfo = {
          amount: session.amount_total/100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId: bookingId,
          serviceName: session.metadata.serviceName,
          transactionId: transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          
        }
       
            const resultPayment = await paymentCollections.insertOne(paymentInfo);

            return res.send({success: true,
               updateBooking: updateBooking,
                         transactionId: transactionId,

               
                payment: resultPayment})
        
        
      }
      return res.send({success: false, message: 'Payment not completed'})
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
