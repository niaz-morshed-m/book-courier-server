const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(express.json());
app.use(cors());

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

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
    // await client.connect();

    const db = client.db("book-courier");
    const userCollection = db.collection("user-collection");
    const bookCollection = db.collection("book-collection");
    const orderCollection = db.collection("order-collection");
    const paymentCollection = db.collection("payment-collection");
    const wishListCollection = db.collection("wishList-collection");
    const reviewCollection = db.collection("review-collection");
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;

      const user = await userCollection.findOne({ email });

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }

      next();
    };

    const verifyLibrarian = async (req, res, next) => {
      const email = req.decoded_email;

      const user = await userCollection.findOne({ email });

      if (!user || user.role !== "librarian") {
        return res.status(403).send({ message: "Forbidden access" });
      }

      next();
    };

    app.get("/users/:email/role",verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/user/create", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "user";
      userInfo.createdAt = new Date();
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        res.send("user already available");
      } else {
        const result = await userCollection.insertOne(userInfo);
        res.send(result);
      }
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const editedUser = req.body;

      const query = {
        email: email,
      };
      const update = {
        $set: {
          name: editedUser.name,
          photoURL: editedUser.photoUrl,
        },
      };

      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    app.patch("/user/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedRole = req.body;

      const query = {
        _id: new ObjectId(id),
      };
      const update = {
        $set: {
          role: updatedRole.role,
        },
      };
      console.log(id);
      const result = await userCollection.updateOne(query, update);
      res.send(result);
    });

    app.get("/book/published", async (req, res) => {
      const query = {
        status: "published",
      };
      const cursor = bookCollection.find(query);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/book/all", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = bookCollection.find();

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/book/latest", async (req, res) => {
      const query = {
        status: "published",
      };

      const cursor = bookCollection
        .find(query)
        .sort({
          addedAt: -1,
        })
        .limit(6);

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/book/details/:id", verifyToken, async (req, res) => {
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

    app.patch(
      "/book/status/:id",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        const id = req.params.id;
        const updatedStatus = req.body;
        let query;
        if (ObjectId.isValid(id)) {
          query = {
            $or: [{ _id: new ObjectId(id) }, { _id: id }],
          };
        } else {
          query = { _id: id };
        }
        const update = {
          $set: {
            status: updatedStatus.status,
          },
        };

        const result = await bookCollection.updateOne(query, update);
        res.send(result);
      }
    );

    app.delete("/book/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      let bookQuery;
      let orderQuery;

      if (ObjectId.isValid(id)) {
        bookQuery = {
          $or: [{ _id: new ObjectId(id) }, { _id: id }],
        };

        orderQuery = {
          $or: [{ bookId: new ObjectId(id) }, { bookId: id }],
        };
      } else {
        bookQuery = { _id: id };
        orderQuery = { bookId: id };
      }

      const orderResult = await orderCollection.deleteMany(orderQuery);
      const bookResult = await bookCollection.deleteOne(bookQuery);

      res.send({
        bookDeleted: bookResult.deletedCount,
        ordersDeleted: orderResult.deletedCount,
      });
    });

    app.post("/book/add", verifyToken, verifyLibrarian, async (req, res) => {
      const newBook = req.body;
      const result = await bookCollection.insertOne(newBook);
      res.send(result);
    });

    app.patch("/book/:id", verifyToken, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const editedInfo = req.body;
      let query;
      if (ObjectId.isValid(id)) {
        query = { _id: new ObjectId(id) };
      } else {
        query = { _id: id };
      }
      const update = {
        $set: {
          title: editedInfo.title,
          author: editedInfo.author,
          price: editedInfo.price,
          inStock: parseInt(editedInfo.inStock),
          status: editedInfo.status,
        },
      };
      const result = await bookCollection.updateOne(query, update);
      res.send(result);
    });

    app.post("/order", verifyToken, async (req, res) => {
      const newOrder = req.body;
      const { bookId, quantity } = newOrder;

      if (!quantity || quantity < 1) {
        return res.send({ message: "Invalid quantity" });
      }

      let bookQuery;
      if (ObjectId.isValid(bookId)) {
        bookQuery = {
          $or: [{ _id: new ObjectId(bookId) }, { _id: bookId }],
        };
      } else {
        bookQuery = { _id: bookId };
      }

      const book = await bookCollection.findOne(bookQuery);

      if (book.inStock === 0) {
        return res.send({ message: "Book is out of stock" });
      }

      if (quantity > book.inStock) {
        return res.send({
          message: `Only ${book.inStock} item(s) available in stock`,
        });
      }

      const update = { $inc: { inStock: -quantity } };

      const updateResult = await bookCollection.updateOne(bookQuery, update);

      if (updateResult.modifiedCount === 0) {
        return res.status(400).send({
          message: "Stock update failed. Try again.",
        });
      }

      newOrder.createdAt = new Date();
      const orderResult = await orderCollection.insertOne(newOrder);

      res.send({
        success: true,
        message: "Order placed successfully",
        orderId: orderResult.insertedId,
      });
    });

    app.get(
      "/books/librarian/:email",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        const email = req.params.email;
        const query = {
          librarianEmail: email,
        };
        const cursor = bookCollection.find(query).sort({
          addedAt: -1,
        });
        const result = await cursor.toArray();

        res.send(result);
      }
    );

    app.post("/wishlist/add", verifyToken, async (req, res) => {
      const newWishlist = req.body;

      const result = await wishListCollection.insertOne(newWishlist);
      res.send(result);
    });

    app.get("/wishlist/check", verifyToken, async (req, res) => {
      const { bookId, email } = req.query;

      const query = {
        bookId,
        userEmail: email,
      };

      const exists = await wishListCollection.findOne(query);

      res.send({ exists: !!exists });
    });

    app.get("/wishlist/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await wishListCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    app.get("/order/id/:id", verifyToken, async (req, res) => {
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

    app.get("/order/email/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
      };
      const cursor = orderCollection.find(query).sort({
        createdAt: -1,
      });
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get(
      "/order/librarian/:email",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        const librarianEmail = req.params.email;
        const query = {
          librarianEmail: librarianEmail,
        };
        const cursor = orderCollection.find(query).sort({
          createdAt: -1,
        });
        const result = await cursor.toArray();

        res.send(result);
      }
    );

    app.patch("/order/:id", verifyToken, async (req, res) => {
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

    app.get("/payment/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      const query = {};
      if (email) {
        query.customerEmail = email;
      }

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const cursor = paymentCollection.find(query).sort({
        addedAt: -1,
      });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/create-checkout-session", async (req, res) => {
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

      res.send({ url: session.url });
    });

    app.patch("/check-payment/:sessionId", async (req, res) => {
      const sessionId = req.params.sessionId;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentCollection.findOne(query);

      if (paymentExist) {
        return res.send({
          message: "already payment exists",
          transactionId,
        });
      }

      else{
        if (session.payment_status === "paid") {
          const id = session.metadata.orderId;
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

          const payment = {
            orderId: session.metadata.orderId,
            bookNameName: session.metadata.bookName,
            customerEmail: session.customer_email,
            amount: session.amount_total / 100,
            currency: session.currency,
            transactionId: session.payment_intent,
            paidAt: new Date(),
          };
          const paymentResult = await paymentCollection.insertOne(payment);
          res.send(result);
        }
      }
    });

    app.get("/order/stats", verifyToken, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            status: "$_id",
            count: 1,
          },
        },
      ];
      const result = await orderCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get(
      "/librarian/orders/stats/:email",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const email = req.params.email;

          const pipeline = [
            {
              $match: { librarianEmail: email },
            },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                status: "$_id",
                count: 1,
                _id: 0,
              },
            },
          ];

          const result = await orderCollection.aggregate(pipeline).toArray();

          const delivered =
            result.find((item) => item.status === "delivered")?.count || 0;

          const pending =
            result.find((item) => item.status === "pending")?.count || 0;

          const cancelled =
            result.find((item) => item.status === "cancelled")?.count || 0;

          res.send({
            delivered,
            pending,
            cancelled,
          });
        } catch (error) {
          res.status(500).send({ message: "Failed to get order stats" });
        }
      }
    );

    app.post("/reviews", verifyToken, async (req, res) => {
      try {
        const review = req.body;

        const alreadyReviewed = await reviewCollection.findOne({
          bookId: review.bookId,
          userEmail: review.userEmail,
        });

        if (alreadyReviewed) {
          return res
            .status(400)
            .send({ message: "You already reviewed this book" });
        }

        review.createdAt = new Date();
        const result = await reviewCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add review" });
      }
    });

    app.get("/reviews/:bookId", async (req, res) => {
      const bookId = req.params.bookId;

      const query = ObjectId.isValid(bookId)
        ? { $or: [{ bookId: new ObjectId(bookId) }, { bookId }] }
        : { bookId };

      const result = await reviewCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
