const express = require('express')
const app = express();
const port = process.env.PORT || 3000;
// middleware
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Welcome to Laxius Decor')
})

app.listen(port, () => {
  console.log(`Laxius decor in running on port: ${port}`)
})