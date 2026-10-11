import mongoose, { mongo } from "mongoose";

const connectToDb = async () => {
    await mongoose.connect("")
    console.log("connect to db")
}

export default connectToDb