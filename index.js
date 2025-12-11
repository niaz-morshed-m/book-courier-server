const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.DB_PASS}@cluster0.7ybd4ac.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("book-courier");
    const bookCollection = db.collection("book-collection");
    const orderCollection = db.collection("order-collection");

    app.get("/book/all", async (req, res) => {
      const cursor = bookCollection.find();

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/book/latest", async (req, res) => {
      const cursor = bookCollection
        .find()
        .sort({
          addedAt: -1,
        })
        .limit(6);

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/book/details/:id", async (req, res) => {
      const id = req.params.id;
      let query;
      if (ObjectId.isValid(id)) {
        query = {
          $or: [{ _id: new ObjectId(id) }, { _id: id }],
        };
      } else {
        query = { _id: id };
      }
      const result = await bookCollection.findOne(query);
      res.send(result);
    });

    app.post("/order", async (req, res) => {
      const newOrder = req.body;
      newOrder.createdAt = new Date();
      const result = await orderCollection.insertOne(newOrder);
      res.send(result);
    });

    app.get("/order/email/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
      };
      const cursor = orderCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/order/id/:id", async (req, res) => {
      const id = req.params.id;
      let query;
      if (ObjectId.isValid(id)) {
        query = {
          $or: [{ _id: new ObjectId(id) }, { _id: id }],
        };
      } else {
        query = { _id: id };
      }
      const result = await orderCollection.findOne(query);

      res.send(result);
    });

    app.patch("/order/:id", async (req, res) => {
      const id = req.params.id;
      const updatedStatus = req.body;
      let query;
      if (ObjectId.isValid(id)) {
        query = { _id: new ObjectId(id) };
      } else {
        query = { _id: id };
      }

      const update = { $set: { status: updatedStatus.status } };

      const result = await orderCollection.updateOne(query, update);
      res.send(result);
    });

    app.post('/create-checkout-session', async (req, res) => {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.cost) * 100;

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "USD",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.bookName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.email,
          mode: "payment",
          metadata: {
           orderId: paymentInfo._id,
            bookName: paymentInfo.bookName,
          },
          success_url: `${process.env.SITE_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_URL}/dashboard/payment-cancelled`,
        });

        
        res.send({ url: session.url })
    })



    app.patch('/check-payment/:sessionId', async (req, res)=>{
const sessionId = req.params.sessionId
const session = await stripe.checkout.sessions.retrieve(sessionId)
console.log(session)
if(session.payment_status==="paid"){

    const id = session.metadata.orderId
    let query;
    if (ObjectId.isValid(id)) {
      query = {
        $or: [{ _id: new ObjectId(id) }, { _id: id }],
      };
    } else {
      query = { _id: id };
    }
    const update = { $set: { paymentStatus: "paid" } };

    const result = await orderCollection.updateOne(query, update);
res.send(result)
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
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});


