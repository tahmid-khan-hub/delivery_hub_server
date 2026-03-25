import { validateOrder } from "../utils/helper.js";

export const orderHandler = (io, socket) => {
    console.log("working smooth!!!!!!!!!!!!!", socket.id);

    // emit -> trigger -> on -> listen  

    // place order
    socket.on("placeOrder", async(data, Callback) => {
        try {
            console.log(`placed order from ${socket.id}`);
            const validation = validateOrder(data);
            if(!validation.valid) return Callback({ success: false, message: validation.message })
        } catch (error) {
            console.log(error);
        }
    })

}