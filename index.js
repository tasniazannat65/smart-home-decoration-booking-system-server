const express = require("express");
const cors = require("cors");
require('dotenv').config();
const  admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET);


// const  serviceAccount = require("./laxius_decor_firebase_adminsdk_key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

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


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
        const db = client.db('laxius_decor');
        const userCollections = db.collection('users');
        const serviceCollections = db.collection('services');
        const packageCollections = db.collection('packages');
        const bookingCollections = db.collection('bookings');
        const paymentCollections = db.collection('payments');
        const reviewCollections = db.collection('reviews');

        const verifyJWTToken = async(req, res, next)=>{
  const token = req.headers.authorization;
  if(!token){
    return res.status(401).send({message: 'Unauthorized access'})
  }
  try{
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const user = await userCollections.findOne({email: decoded.email});
    if(!user){
      return res.status(401).send({message: 'User not found'});

    }
    req.user = user;
    req.decoded_email = decoded.email;
    next();


  }
  catch(err){
      return res.status(401).send({message: 'Unauthorized access'})


  }

  
}

        // role middleware
         const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded_email;
      const query = {email};
      const user = await userCollections.findOne(query);
      if(!user || user.role !== 'admin'){
        res.status(403).send({message: 'forbidden access'})
      }


      next();

    }
    const verifyDecorator = async(req, res, next)=>{
     const email = req.decoded_email;
     const decorator = await userCollections.findOne({
      email,
      role: 'decorator',
      status: 'approved'
     });
     if(!decorator){
      return res.status(403).send({message: 'forbidden access'})
     }
      req.decorator = decorator;
      next();

    }


        // user related API's
        app.post('/users', async(req, res)=>{
            const user = req.body;
            user.role = 'user';
            user.status = null;
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

    app.get('/users', verifyJWTToken, verifyAdmin, async(req, res)=>{
      
     try {
                 const search = req.query.search || "";

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const query = {role: {$ne: 'admin'}}
      if(search){
        query.displayName = {$regex: search, $options: 'i'};
      }
      
       const total = await userCollections.countDocuments(query);
      const users = await userCollections.find(query).sort({createdAt: -1}).skip(skip).limit(limit).toArray();
      return res.send({
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit)

      });
      
     } catch (error) {
      res.status(500).send({message: 'Failed to fetch users'})
      
     }
    })





    app.get('/users/top-decorators', async(req, res)=>{
      try {
        const decorators = await userCollections.find({
          role: 'decorator',
          status: 'approved'
        }).sort({rating: -1, totalJobs: -1}).limit(6).project(
          {displayName: 1,
            photoURL: 1,
            specialties: 1,
            rating: 1
          }).toArray();
          res.send(decorators);
        
      } catch (error) {
        res.status(500).send({message: 'Failed to load top decorators'})
        
      }
    })

    app.patch('/decorator/update-specialties', verifyJWTToken, verifyDecorator, async(req, res)=>{
      try {
        const decoratorId = req.decorator._id;
        const {specialties} = req.body;
        if(!Array.isArray(specialties)){
          return res.status(400).send({message: 'Specialties must be an array'});
        }
         await userCollections.updateOne(
          {_id: decoratorId},
          {
            $set: {
              specialties,
              updatedAt: new Date(),
              rating: req.decorator.rating ?? 0
            }
          }
         )

         res.send({success: true, message: 'Specialties updated'});
        
      } catch (error) {
        res.status(500).send({message: 'Failed to update specialties'});
        
      }
    })
   

    app.put('/users/:id/make-decorator', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
        const result = await userCollections.updateOne(
          {_id: id, role: 'user'},
          {
            $set: {
              role: 'decorator',
               status: 'pending',
               specialties: ['Wedding', 'Home Decor'],
               totalJobs: 0,
               rating: 0,
               createdAt: new Date()
            }
          }
        )
        res.send(result);
        
        
      } catch (error) {
        res.status(500).send({message: 'Failed to make a user to a decorator'})
        
      }
    })
    app.put('/users/:id/approve',verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
        const result = await userCollections.updateOne(
          {_id: id, role: 'decorator'},
          {
            $set: {
               status: 'approved',
               rating: 0
            }
          }
        )
        res.send(result);
        
        
      } catch (error) {
        res.status(500).send({message: 'Failed to approve decorator'})
        
      }
    })
    app.put('/users/:id/disable', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
        const result = await userCollections.updateOne(
          {_id: id},
          {
            $set: {
               status: 'disabled'
            }
          }
        )
        res.send(result);
        
        
      } catch (error) {
        res.status(500).send({message: 'Failed to disable decorator'})
        
      }
    })
    app.put('/users/:id', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
        const update = {$set: req.body};
        const result = await userCollections.updateOne(
          {_id: id}, update
         
        )
        res.send(result);
        
        
      } catch (error) {
        res.status(500).send({message: 'Failed to update user'})
        
      }
    })
    
    app.delete('/users/:id', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
        const result = await userCollections.deleteOne(
          {_id: id}
         
        )
        res.send(result);
        
        
      } catch (error) {
        res.status(500).send({message: 'Failed to delete user'})
        
      }
    })
  
    // services related API's
    app.get('/services', async(req, res)=>{
      try {
           const search = req.query.search || "";
      const category = req.query.category || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const isAdmin = req.query.admin === 'true';
      const skip = (page - 1) * limit;
      let min =   parseInt(req.query.min);
      let max =   parseInt(req.query.max);
      if(isNaN(min)) min = 0;
      
      if(isNaN(max)) max = 9999999;
      
      const  query = {
        cost: {$gte: min, $lte: max}
      };
      if(search){
        query.service_name = {$regex: search, $options: 'i'};
      }
      if(category){
        query.service_category = category;
      }
      if(isAdmin){
      const total = await serviceCollections.countDocuments(query);
       const services = await serviceCollections.find(query).sort({createdAt: -1}).skip(skip).limit(limit).toArray();
      return res.send({
        services,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });


      }
     const services = await serviceCollections.find(query).sort({createdAt: -1}).toArray();
     res.send(services);
        
      } catch (error) {
        res.status(500).send({message: 'Server error'});
        
      }
   
    })

    app.get('/services/all', async(req, res)=>{
      const services = await serviceCollections.find().toArray();
      res.send({services});
    })

    app.get('/latest-services', async(req, res)=>{
      try {
        const query = {};
        const result = await serviceCollections.find(query).sort({createdAt: -1}).limit(8).toArray();
        res.send(result);
        
      } catch (error) {
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
        res.status(500).send({message: 'Server error'})

        
      }
     
    })

    app.post('/services', verifyJWTToken, verifyAdmin, async (req, res)=> {
     try {
       const service = {
        service_name: req.body.service_name,
        image: req.body.image,
        cost: req.body.cost,
        unit: req.body.unit,
        service_category: req.body.service_category,
        description: req.body.description,
        createdByEmail: req.decoded_email,
        createdAt: new Date(),
      }
      const result = await serviceCollections.insertOne(service);
      res.send(result);
      
     } catch (error) {
        res.status(500).send({message: 'Server error'})
     }
    })
    app.patch('/services/:id', verifyJWTToken, verifyAdmin, async(req, res)=>{
     try {
       const id = req.params.id;
   const {service_name, service_category, cost, unit, image, description} = req.body;
       
      const result = await serviceCollections.updateOne(
       {_id: new ObjectId(id)},
       {$set: {
       service_name,
      service_category,
      cost,
      unit,
      image,
      description,
      updatedAt: new Date()
       }}
      )
    

      res.send(result);
      
     } catch (error) {
        res.status(500).send({message: 'Server error'})

      
     }
    })

    app.delete('/services/:id', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const id = new ObjectId(req.params.id);
      const result = await serviceCollections.deleteOne({_id: id});
      res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Server error'})
        
      }
    })

    // packages related API's
     app.get('/packages', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
           const search = req.query.search || "";
      const category = req.query.category || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      
      const  query = {};

      if(search){
        query.package_name = {$regex: search, $options: 'i'};
      }
      if(category){
        query.category = category;
      }
      const total = await packageCollections.countDocuments(query);
      const packages = await packageCollections.find(query).sort({createdAt: -1}).skip(skip).limit(limit).toArray();
      res.send({
        packages,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
        
      } catch (error) {
        res.status(500).send({message: 'Server error'});
        
      }
   
    })

    app.post('/packages', verifyJWTToken, verifyAdmin, async (req, res)=> {
     try {
      const packageData = {
        ...req.body,
        createdAt: new Date()
      }
      const result = await packageCollections.insertOne(packageData);
      res.send(result);
      
     } catch (error) {
        res.status(500).send({message: 'Server error'})
     }
    })

     app.patch('/packages/:id', verifyJWTToken, verifyAdmin, async(req, res)=>{
     try {
       const id = req.params.id;
const updateDoc = {
 $set: {
   ...req.body,
  updatedAt: new Date()
 }
}       
      const result = await packageCollections.updateOne(
       {_id: new ObjectId(id)},
       updateDoc
      )
    

      res.send(result);
      
     } catch (error) {
        res.status(500).send({message: 'Server error'})

      
     }
    })

    app.delete('/packages/:id', verifyJWTToken, verifyAdmin, async(req, res)=> {
      const result = await packageCollections.deleteOne({
        _id: new ObjectId(req.params.id)
      });
      res.send(result);
    })








    // bookings related API's

    app.post('/bookings', verifyJWTToken, async(req, res)=>{
      try {
        const bookingInfo = {
          ...req.body,
          bookingDate: new Date(req.body.bookingDate),
          paymentStatus: 'pending',
          status: 'pending',
          createdAt: new Date()
        };
        const result = await bookingCollections.insertOne(bookingInfo);
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Booking failed'})

        
      }
      

    })

    app.get('/bookings',verifyJWTToken, async(req, res)=>{
      try {
        const email = req.query.email;
        const result = await bookingCollections.find({userEmail: email}).sort({createdAt: -1}).toArray();
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Server error'})
        
      }
    })

    app.patch('/bookings/:id', verifyJWTToken, async(req, res)=>{
      try {
        const id = req.params.id;
        const {location, date} = req.body;
        const result = await bookingCollections.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              location,
              bookingDate: new Date(date),
              updatedAt: new Date()
            }
          }
        )
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Server error'})
        
      }
    })
    app.get('/bookings/admin-to-assign', verifyJWTToken, verifyAdmin, async(req, res)=> {
      try {
        const bookings = await bookingCollections.find({
          paymentStatus: 'paid',
          decoratorId: {$exists: false}
        }).sort({createdAt: -1}).toArray();
        res.send(bookings);
        
      } catch (error) {
        res.status(500).send({message: 'Failed to fetch bookings'})
        
      }
    } )
    app.get('/bookings/admin', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
              const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
             const total = await bookingCollections.countDocuments({});

        const bookings = await bookingCollections.find({}).sort({createdAt: -1}).skip(skip).limit(limit).toArray();
       return res.send({
        bookings,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
        
      } catch (error) {
        res.status(500).send({message: 'Failed to load bookings'})
        
      }
    })
    app.get('/admin/revenue-analytics', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
        const result = await paymentCollections.aggregate([
          {
            $addFields: {
              createdAt: {
                $ifNull: ['$createdAt', new Date()]
              }
            }

          },
         
          {
            $group: {
              _id: {
                year: {$year: '$createdAt'},
                month: {$month: '$createdAt'}
              },
              revenue: {$sum: '$price'},
              totalPayments: {$sum: 1}
            }
          },
          {
            $project: {
              _id: 0,
              month: {
                $concat: [
                  {$toString: '$_id.year'},
                  '_',
                  {
                    $cond: [
                      {$lt: ['$_id.month', 10]},
                      {$concat: ['0', {$toString: '$_id.month'}]},
                         {$toString: '$_id.month'}

                    ]

                  }
                ]
              },
              revenue: 1,
              totalPayments: 1
            }
          },
          {$sort: {month: 1}}
        ]).toArray();
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Revenue analytics failed'})
        
      }
    })

    app.get('/admin/service-demand', verifyJWTToken, verifyAdmin, async(req, res)=> {
      try {
        const result = await bookingCollections.aggregate([
          {
            $match: {serviceName: {$exists: true, $ne: ''}} 
          },
         
         
          {
           $group: {
            _id: '$serviceName',
            count: {$sum: 1}
           }
          },
          {
            $project: {
              _id: 0,
              service: '$_id',
              count: 1
            }
          },
          {$sort: {count: -1}}
          
        ]).toArray();
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Service demand error'})
        
      }
    })

    app.get('/admin/dashboard-summary', verifyJWTToken, verifyAdmin, async(req, res)=> {
      try {
        const totalBookings = await bookingCollections.countDocuments();
        const paidBookings = await bookingCollections.countDocuments({
          paymentStatus: 'paid',
        })
        const pendingAssignments = await bookingCollections.countDocuments({
          paymentStatus: 'paid',
          decoratorId: {$exists: false},
        });
        
        const revenueAgg = await paymentCollections.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {$sum: '$price'},
            },
          }
        ]).toArray();
        const totalRevenue = revenueAgg[0]?.totalRevenue || 0;
        const activeDecorators = await userCollections.countDocuments({
          role: 'decorator',
          status: 'approved'
        })
         const totalServices = await serviceCollections.countDocuments();

        res.send({
          totalRevenue,
          totalBookings,
          paidBookings,
          pendingAssignments,
          
          activeDecorators,
          totalServices,
        })

        
      } catch (error) {
        res.status(500).send({message: 'Dashboard summary failed'
        })
        
      }
    })

    app.get('/user/dashboard-summary', verifyJWTToken, async(req, res)=>{
      const email = req.decoded_email;
      const totalBookings = await bookingCollections.countDocuments({
        userEmail: email
      });
      const pendingPayment = await bookingCollections.countDocuments({
        userEmail: email,
        paymentStatus: {$ne: 'paid'}
      });
      const completed = await bookingCollections.countDocuments({
        userEmail: email,
        status: 'completed'
      });
      const cancelled = await bookingCollections.countDocuments({
        userEmail: email,
        status: 'cancelled'
      });
      res.send({
        totalBookings,
        pendingPayment,
        completed,
        cancelled
      })
    })
    app.get('/decorator/dashboard-summary', verifyJWTToken, verifyDecorator, async(req, res)=> {
      const decoratorId = req.decorator._id;
      const decorator = await userCollections.findOne(
        {_id: decoratorId},
        {projection: {specialties: 1, rating: 1}}
      )
      const totalJobs = await bookingCollections.countDocuments({
        decoratorId,
        paymentStatus: 'paid',
      });
      const today = new Date();
      const start = new Date(today);
       start.setHours(0,0,0,0,);
       const end = new Date(today);
       end.setHours(23,59,59,999);
    
      const todayJobs = await bookingCollections.countDocuments({
        decoratorId,
        bookingDate: {$gte: start, $lte: end},
        paymentStatus: 'paid'
      });
      const earningsAgg = await paymentCollections.aggregate([
        {$match: {decoratorId}},
        {$group: {_id: null, totalEarnings: {$sum: '$price'}}},
      ]).toArray();
      res.send({
        totalJobs,
        todayJobs,
        totalEarnings: earningsAgg[0]?.totalEarnings || 0,
        specialties: decorator?.specialties || [],
        rating: decorator?.rating || 0
      })
    })
    app.get('/decorator/assigned-projects', verifyJWTToken, verifyDecorator, async(req, res)=>{
      const decoratorId = req.decorator._id;
      const result = await bookingCollections.find({
        decoratorId,
        paymentStatus: 'paid'
      }).sort({createdAt: -1})
      .toArray();
      res.send(result);
    })
    app.get('/decorator/today-schedule', verifyJWTToken, verifyDecorator, async(req, res)=> {
      const decoratorId = req.decorator._id;
      const today = new Date();
      const start = new Date(today);
       start.setHours(0,0,0,0,);
       const end = new Date(today);
       end.setHours(23,59,59,999);


      
      const result = await bookingCollections.find({
        decoratorId,
        bookingDate: {$gte: start, $lte: end},
        paymentStatus: 'paid'
      }).toArray();
      res.send(result);
    })



    app.get('/decorator/earning-summary', verifyJWTToken, verifyDecorator, async(req, res)=>{
            const decoratorId = req.decorator._id;

      const result = await paymentCollections.aggregate([
        {$match: {decoratorId}},
        {
          $group: {
            _id: null,
            totalEarnings: {$sum: '$price'},
            totalJobs: {$sum: 1}
          }
        }
      ]).toArray();
      res.send(result[0] || {totalEarnings: 0, totalJobs: 0});
    })
    app.get('/decorator/earning-history', verifyJWTToken, verifyDecorator, async(req, res)=>{
        const decoratorId = req.decorator._id;

      const result = await paymentCollections.find({
        decoratorId
      
      }).sort({createdAt: -1}).toArray();
      res.send(result);
    })
  
app.get('/decorator/project/:id', verifyJWTToken, verifyDecorator, async(req, res)=>{
  try {
    const bookingId = req.params.id;
    const decoratorId = req.decorator._id;
    const booking = await bookingCollections.findOne({
      _id: new ObjectId(bookingId),
      decoratorId
    })
    if(!booking){
      return res.status(404).send({message: 'Project not found'})
    }
    res.send(booking)
    
  } catch (error) {
    res.status(500).send({message: 'Server error'})
  }
}) 

app.patch('/decorator/project/:id/status', verifyJWTToken, verifyDecorator, async(req, res)=>{
  try {
    const bookingId = new ObjectId(req.params.id);
    const {status} = req.body;
    const decoratorId = new ObjectId(req.decorator._id);
    const allowedStatus = ['assigned',
      'planning',
      'materials_ready',
      'on_the_way',
      'completed'

    ]
    if(!allowedStatus.includes(status))return res.status(400).send({message: 'Invalid status'});
    const result = await bookingCollections.updateOne(
      {_id: bookingId, decoratorId},
      {
        $set: {status, updatedAt: new Date()},
        $push: {statusHistory: {status, time: new Date()}}
      }
    );
    if(result.matchedCount === 0) return res.status(404).send({message: 'Project not found or unauthorized '})
      res.send({success: true, message: 'Status updated'})

    


  } catch (error) {
    res.status(500).send({message: 'Server error'})
    
  }
})

    app.patch('/bookings/:id/assign-decorator', verifyJWTToken, verifyAdmin, async(req, res)=>{
      try {
       const bookingId = new ObjectId(req.params.id);
       const {decoratorId} = req.body;
       const booking = await bookingCollections.findOne({
        _id: bookingId,
        paymentStatus: 'paid',
        decoratorId: {$exists: false}
       })
       if(!booking){
        return res.status(400).send({message: 'Booking not valid for assignment'});
      
       }
        
        await bookingCollections.updateOne(
         {_id: bookingId},
         {
          $set: {
            decoratorId: new ObjectId(decoratorId),
            status: 'assigned',
            assignedAt: new Date()
          }
         } 
        )
        await userCollections.updateOne(
          {_id: new ObjectId(decoratorId), role: 'decorator'},
          {
            
            
            $inc: {totalJobs: 1}
          }
        )
        await paymentCollections.updateOne(
          {bookingId},
          {$set: {
            decoratorId: new ObjectId(decoratorId)
          }}
        )
        res.send({success: true, message: 'Decorator assigned successfully'})
      } catch (error) {
        res.status(500).send({message: 'Failed to assign decorator'})
        
      }
    })


    app.delete('/bookings/:id', verifyJWTToken, async(req, res)=>{
      try {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await bookingCollections.deleteOne(query);
        res.send(result);
        
      } catch (error) {
        res.status(500).send({message: 'Server error'})

        
      }

    })

    // payment related API's
     app.post('/payment-checkout-session', verifyJWTToken, async(req, res)=>{
      const paymentInfo = req.body;
      const amount = Math.round(Number(paymentInfo.cost) * 100);
      const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        
        price_data: {
          currency: 'USD',
          unit_amount: amount,
          product_data: {
            
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

     app.patch('/payment-success', verifyJWTToken, async(req, res)=>{
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

     const transactionId = session.payment_intent;
     const paymentExist = await paymentCollections.findOne({transactionId});
     if(paymentExist){
      return res.send({message: 'Payment already recorded', transactionId
      })
     }



      if(session.payment_status === 'paid'){
        const bookingId = new ObjectId(session.metadata.bookingId);
        const booking = await bookingCollections.findOne({
          _id: new ObjectId(bookingId)
        })
        if(!booking){
          return res.status(404).send({message: 'Booking not found'});
        }
        await bookingCollections.updateOne(
        {_id: new ObjectId(bookingId)},
        {
          $set: {
            paymentStatus: 'paid',
            status: 'pending_assignment',
            paidAt: new Date()
          }
        }
       )

        const paymentInfo = {
          price: session.amount_total/100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId,
          decoratorId: booking.decoratorId || null,
          serviceName: session.metadata.serviceName,
          serviceCategory: booking.serviceCategory || 'general',
          transactionId: transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          createdAt: new Date()
          
        }
       
            const resultPayment = await paymentCollections.insertOne(paymentInfo);

            return res.send({success: true,
                         transactionId: transactionId,

               
                payment: resultPayment})
        
        
      }
      return res.send({success: false, message: 'Payment not completed'})
    })

    app.get('/payments', verifyJWTToken, async(req, res)=>{
      const email = req.query.email;
      const query = {};
      if(email){
        query.customerEmail = email;
        if(email !== req.decoded_email){
          return res.status(403).send({message: 'Forbidden Access'})
        }
      }
      const result = await paymentCollections.find(query).sort({paidAt: -1}).toArray();

       res.send(result);
    })

    // reviews related API's

    app.get('/reviews', async(req, res)=> {
      const reviews = await reviewCollections.find().sort({createdAt: -1}).limit(8).toArray();
      res.send(reviews);
    });

    app.post('/reviews', verifyJWTToken, async(req, res)=> {
      const {rating, message, bookingId} = req.body;
      if(!rating || !message || !bookingId) {
        return res.status(400).send({message: 'All field required'});

      }
      const completedBooking = await bookingCollections.findOne({
        userEmail: req.decoded_email,
        _id: new ObjectId(bookingId),
        paymentStatus: 'paid',
        status: 'completed'
      });
      if(!completedBooking){
        return res.status(403).send({
          message: 'You can review only after completing this service'
        })
      }
      const serviceId = completedBooking.serviceId;
        const alreadyReviewed = await reviewCollections.findOne({
        userId: req.user._id,
        serviceId: new ObjectId(serviceId)
      })
      if(alreadyReviewed){
        return res.status(409).send({message: 'Already reviewed'});

      }

      const review = {
        userId: req.user._id,
        userEmail: req.decoded_email,
        userName: req.user.displayName,
        userPhoto: req.user.photoURL,
        serviceId: new ObjectId(serviceId),
        rating: Number(rating),
        message,
        createdAt: new Date()
      }
    
      const result = await reviewCollections.insertOne(review);
      const serviceReviews = await reviewCollections.aggregate([
        {$match: {serviceId: new ObjectId(serviceId)}},
        {$group: {_id: null, avgRating: {$avg: '$rating'}}}
      ]).toArray();
      const serviceAvgRating = serviceReviews[0]?.avgRating || 0;
      const service = await serviceCollections.findOne(
        {_id: new ObjectId(serviceId)}
      );
      await serviceCollections.updateOne(
        {_id: new ObjectId(serviceId)},
        {$set: {rating: Number(serviceAvgRating.toFixed(1))}}
      )

      if(service?.createdByEmail){
        const decorator = await userCollections.findOne({
          email: service.createdByEmail,
          role: 'decorator'
        })
        if(decorator){
          const decoratorServices = await serviceCollections.find({createdByEmail: decorator.email}).project({_id: 1}).toArray();
          const serviceIds = decoratorServices.map(s => s._id);
          const decoratorRatingAgg = await reviewCollections.aggregate([
            {$match: {serviceId: {$in: serviceIds}}},
            {$group: {_id: null, avgRating: {$avg: '$rating'}}}
          ]).toArray();
          const decoratorAvgRating = decoratorRatingAgg[0]?.avgRating || 0;
          await userCollections.updateOne(
            {_id: decorator._id},
            {$set: {rating: Number(decoratorAvgRating.toFixed(1))}}
          )

        }
      }
      
      res.send(result);
    })
     app.get('/reviews', async(req, res)=> {
      const reviews = await reviewCollections.find().sort({createdAt: -1}).limit(8).toArray();
      res.send(reviews);

    })

    app.get('/reviews/service/:id', async(req, res)=> {
      const serviceId = req.params.id;
      const reviews = await reviewCollections.find({serviceId: new ObjectId(serviceId)}).sort({createdAt: -1}).toArray();
      res.send(reviews);
    })

   

    

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Laxius decor in running on port: ${port}`);
});
