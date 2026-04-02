import { ReturnDocument } from "mongodb";
import { getCollection } from "../config/database.js";
import { calculateTotals, createOrderDocument, generateOrderId, isValidStatusTransition, validateOrder } from "../utils/helper.js";

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

    // Get my orders
    socket.on("getMyOrders", async(data, Callback) => {
        try {
            const ordersCollection = getCollection('orders')
            const orders = await ordersCollection.find({ 
                customerPhone: data.customerPhone
            }).sort({ createdAt: -1 }).limit(20).toArray();

            Callback({ success: true, orders });
        } catch (error) {
            console.error("get my orders error: ", error);
            Callback({ success: false, message: error.message });
        }
    })

    // Admin events

    // Admin Login
    socket.on('adminLogin', async(data, Callback) => {
        try {
            if(data.password === process.env.ADMIN_PASSWORD) {
                socket.isAdmin = true;
                socket.join("admins");
                console.log(`admin logged in: ${socket.id}`);
                Callback({ success: true })
            } else {
                Callback({ success: false, message: "Invalid password" })
            }
        } catch (error) {
            Callback({ success: false, message: error.message });
        }
    })

    // Admin get all orders
    socket.on("getAllOrders", async(data, Callback) => {
        try {
            if(!socket.isAdmin) return Callback({ success:false, message: "Unauthorized" })

            const ordersCollection = getCollection('orders');
            const filter = (data?.status)? {status: data.status} : {};
            const orders = await ordersCollection.find(filter).sort({ createdAt: -1 }).limit(20).toArray();

            Callback({ success: true, orders });
        } catch (error) {
            Callback({ success: false, message: error.message });
        }
    })

    // Admin update order status
    socket.on("updateOrderStatus", async(data, Callback) => {
        try {
            const ordersCollection = getCollection('orders');
            const order = await ordersCollection.findOne({ orderId: data.orderId });

            if(!order) return Callback({ success: false, message: "Order not found" })

            if(!isValidStatusTransition(order.status, data.newStatus)) return Callback({ success: false, message: "Invalid status transition" })

            const result = await ordersCollection.findOneAndUpdate(
                { orderId: data.orderId },
                {
                    $set: { status: data.newStatus, updatedAt: new Date() },
                    $push: { 
                        statusHistory: {
                            status: data.newStatus,
                            timestamp: new Date(),
                            by: socket.id,
                            note: "Status updated by admin"
                        }
                    }
                },
                { ReturnDocument: 'after' }
            )

            io.to(`order-${data.orderId}`).emit('statusUpdated', { orderId: data.orderId, status: data.newStatus, order: result });
            socket.to('admin').emit("order status changed", { orderId: data.orderId, status: data.newStatus });

            Callback({ success: true, order: result });
        } catch (error) {
            Callback({ success: false, message: error.message });
        }
    })

    // Admin accepting order
    socket.io("acceptOrder", async(data, Callback) => {
        try {
            if(!socket.isAdmin) return Callback({ success:false, message: "Unauthorized" })

            const ordersCollection = getCollection('orders');
            const order = await ordersCollection.findOne({ orderId: data.orderId });

            if(!order || order.status !== "pending") return Callback({ success: false, message: "Can't accept this order" }) ;

            const estimatedTime = data.estimatedTime || 30;
            const result = await ordersCollection.findOneAndUpdate(
                { orderId: data.orderId },
                {
                    $set: { status: "confirmed", estimatedTime, updatedAt: new Date() },
                    $push: { 
                        statusHistory: {
                            status: "confirmed",
                            timestamp: new Date(),
                            by: socket.id,
                            note: `Accepted with ${estimatedTime} min estimated time`
                        }
                    }         
                },
                { ReturnDocument: "after" }
            )

            io.to(`order-${data.orderId}`).emit("orderAccepted", { orderId: data.orderId, estimatedTime });
            socket.on("admins").emit("orderAcceptedByAdmin", { orderId: data.orderId })

            Callback({ success: true, order: result });
        } catch (error) {
            Callback({ success: false, message: error.message });
        }
    })

}