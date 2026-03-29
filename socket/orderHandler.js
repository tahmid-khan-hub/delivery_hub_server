import { getCollection } from "../config/database.js";
import { calculateTotals, createOrderDocument, generateOrderId, validateOrder } from "../utils/helper.js";

export const orderHandler = (io, socket) => {
    console.log("working smooth!!!!!!!!!!!!!", socket.id);

    // emit -> trigger -> on -> listen  

    // place order
    socket.on("placeOrder", async(data, Callback) => {
        try {
            console.log(`placed order from ${socket.id}`);
            const validation = validateOrder(data);
            if(!validation.valid) return Callback({ success: false, message: validation.message })
            
            const totals = calculateTotals(data.items);
            const orderId = generateOrderId();
            const order = createOrderDocument(data, orderId, totals);

            const ordersCollection = getCollection('orders');
            await ordersCollection.insertOne(order);

            socket.join(`order-${orderId}`);
            socket.join('customers');

            io.to('admins').emit('newOrder', { order })

            Callback({ success: true, order });
            console.log(`order created ${orderId}`);
        } catch (error) {
            console.log(error);
            Callback({ success: false, message: 'Failed to place order' })
        }
    })

    // Track order
    socket.on("trackOrder", async(data, Callback) => {
        try {
            const ordersCollection = getCollection('orders')
            const order = await ordersCollection.findOne({ orderId: data.orderId })

            if(!order) return Callback({ success: false, message: "Order not found" })

            socket.join(`order-${data.orderId}`)
            Callback({ success: true, order });
        } catch (error) {
            console.error("order tacking error: ", error);
            Callback({ success: false, message: error.message });
        }
    })

}