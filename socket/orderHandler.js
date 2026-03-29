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

    // Cancel order
    socket.on("cancelOrder", async(data, Callback) => {
        try {
            const ordersCollection = getCollection('orders')
            const order = await ordersCollection.findOne({ orderId: data.orderId })

            if(!order) return Callback({ success: false, message: "Order not found" })

            if(!['pending', 'confirmed'].includes(order.status)) return Callback({ success: false, message: "Can not cancel the order" });

            await ordersCollection.updateOne(
                { orderId: data.orderId },
                {
                    $set: { status: 'cancelled', updatedAt: new Date() },
                    $push: {
                        statusHistory: {
                            status: 'cancelled',
                            timestamp: new Date(),
                            by: socket.id,
                            note: data.reason || 'Cancelled by customer'
                        }
                    }
                }
            )

            io.to(`order-${data.orderId}`).emit('orderCancelled', { orderId: data.orderId });
            io.to('admins').emit('orderCancelled', { orderId: data.orderId, customerName: order.customerName });

            Callback({ success: true });
        } catch (error) {
            console.error("order cancel error: ", error);
            Callback({ success: false, message: error.message });
        }
    })

}