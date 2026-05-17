/**
 * Delhivery API Integration Module
 * Handles all Delhivery delivery operations
 */

import axios from 'axios';

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || 'https://staging-express.delhivery.com';
const DELHIVERY_API_KEY = process.env.DELHIVERY_API_KEY;
const DELHIVERY_CLIENT_ID = process.env.DELHIVERY_CLIENT_ID;
const DELHIVERY_CLIENT_SECRET = process.env.DELHIVERY_CLIENT_SECRET;

if (!DELHIVERY_API_KEY) {
  console.warn('⚠️ DELHIVERY_API_KEY is not set. Delivery features will not work.');
}

/**
 * Create an axios instance with Delhivery auth headers
 */
const getDelhiveryClient = () => {
  return axios.create({
    baseURL: DELHIVERY_BASE_URL,
    headers: {
      'Authorization': `Token ${DELHIVERY_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 10000
  });
};

/**
 * Check if delivery is available for the given pincode
 * @param {string} pincode - Destination pincode
 * @returns {Promise<Object>} Availability response
 */
export const checkDeliveryAvailability = async (pincode) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    // Staging API doesn't support pincode filtering — returns full list regardless.
    // In production, swap DELHIVERY_BASE_URL to https://track.delhivery.com
    // and the filter will work correctly.
    const isStaging = DELHIVERY_BASE_URL.includes('staging');

    if (isStaging) {
      // Validate it's a real 6-digit Indian pincode format
      const isValid = /^[1-9][0-9]{5}$/.test(pincode);
      return {
        available: isValid,
        pincode,
        city: '',
        state: '',
        deliveryTime: '3-5 business days',
        note: 'Staging mode — pincode lookup bypassed'
      };
    }

    // Production pincode lookup
    const client = getDelhiveryClient();
    const response = await client.get(
      `/api/pin-codes/json/?filter={"postal_code":"${pincode}"}`
    );

    if (response.data?.data?.length > 0) {
      const pinData = response.data.data[0];
      return {
        available: true,
        pincode,
        city: pinData.city || '',
        state: pinData.state || '',
        deliveryTime: pinData.Deliver_by_days || '3-5 business days'
      };
    }

    return {
      available: false,
      pincode,
      message: 'Delivery not available in this area'
    };
  } catch (error) {
    console.error('❌ Delhivery availability check failed:', error.message);
    throw new Error(`Failed to check delivery availability: ${error.message}`);
  }
};

/**
 * Calculate delivery charges
 * @param {Object} params - Delivery parameters
 * @returns {Promise<Object>} Charge details
 */
export const calculateDeliveryCharges = async ({ weight, pincode, origin_pincode = '400001' }) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    // Delhivery doesn't have a public charges API, so we use a fixed pricing model
    // Adjust these based on your agreements with Delhivery
    const WEIGHT_SLAB = weight <= 0.5 ? 'light' : weight <= 2 ? 'medium' : 'heavy';
    
    const chargesMap = {
      light: { local: 30, metro: 40, national: 80 },
      medium: { local: 50, metro: 70, national: 120 },
      heavy: { local: 80, metro: 110, national: 180 }
    };

    // Determine zone based on pincode (simplified - enhance based on your zones)
    let zone = 'national';
    const metroPin = ['400', '110', '201', '302']; // Mumbai, Delhi, Noida, Jaipur
    if (metroPin.some(p => pincode.startsWith(p))) {
      zone = 'metro';
    } else if (Math.abs(parseInt(pincode.substring(0, 3)) - parseInt(origin_pincode.substring(0, 3))) < 50) {
      zone = 'local';
    }

    const charges = chargesMap[WEIGHT_SLAB][zone];

    return {
      success: true,
      charges,
      weight,
      zone,
      slab: WEIGHT_SLAB,
      currency: 'INR',
      gst: Math.round(charges * 0.05 * 100) / 100,
      total: charges + Math.round(charges * 0.05 * 100) / 100
    };
  } catch (error) {
    console.error('❌ Delhivery charge calculation failed:', error.message);
    throw new Error(`Failed to calculate delivery charges: ${error.message}`);
  }
};

/**
 * Create a shipment with Delhivery
 * @param {Object} shipmentData - Shipment details
 * @returns {Promise<Object>} Shipment response
 */
export const createShipment = async (shipmentData) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    // Validate required fields
    const requiredFields = ['order_id', 'customer_name', 'customer_phone', 'customer_email', 'destination_pincode', 'destination_address'];
    for (const field of requiredFields) {
      if (!shipmentData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const client = getDelhiveryClient();

    // Format shipment data for Delhivery API
    const payload = {
      format: 'json',
      data: {
        shipments: [
          {
            name: shipmentData.customer_name,
            add: shipmentData.destination_address,
            pin: shipmentData.destination_pincode,
            city: shipmentData.destination_city || '',
            state: shipmentData.destination_state || '',
            country: 'India',
            phone: shipmentData.customer_phone,
            email: shipmentData.customer_email,
            order: shipmentData.order_id,
            payment_mode: shipmentData.payment_mode || 'COD', // COD or PREPAID
            total_amount: shipmentData.total_amount || 0,
            contents_desc: shipmentData.product_description || 'Ayurvedic Products',
            weight: shipmentData.weight || 0.5,
            waybill: shipmentData.waybill || ''
          }
        ]
      }
    };

    const response = await client.post('/api/v1/create/shipment/', payload);

    if (response.data && response.data.shipments && response.data.shipments.length > 0) {
      const shipment = response.data.shipments[0];
      return {
        success: true,
        shipment_id: shipment.shipment_id,
        waybill: shipment.waybill,
        status: shipment.status,
        order_id: shipmentData.order_id,
        tracking_url: `https://track.delhivery.com/${shipment.waybill}`
      };
    }

    throw new Error('Failed to create shipment - no response data');
  } catch (error) {
    console.error('❌ Delhivery shipment creation failed:', error.message);
    throw new Error(`Failed to create shipment: ${error.message}`);
  }
};

/**
 * Get shipment tracking details
 * @param {string} waybill - Delhivery waybill number
 * @returns {Promise<Object>} Tracking information
 */
export const getShipmentTracking = async (waybill) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const client = getDelhiveryClient();
    const response = await client.get(`/api/p/v1/tracking/json/?waybill=${waybill}`);

    if (response.data && response.data.data && response.data.data.length > 0) {
      const tracking = response.data.data[0];
      return {
        success: true,
        waybill,
        status: tracking.status,
        last_update: tracking.last_update || new Date().toISOString(),
        location: tracking.location || 'In Transit',
        attempts: tracking.attempts || 0,
        return_reason: tracking.return_reason || null
      };
    }

    return {
      success: false,
      message: 'Tracking information not found'
    };
  } catch (error) {
    console.error('❌ Delhivery tracking failed:', error.message);
    throw new Error(`Failed to get tracking info: ${error.message}`);
  }
};

/**
 * Cancel a shipment
 * @param {string} waybill - Delhivery waybill number
 * @returns {Promise<Object>} Cancellation response
 */
export const cancelShipment = async (waybill) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const client = getDelhiveryClient();
    const response = await client.post('/api/v1/shipments/cancel/', {
      format: 'json',
      data: {
        shipments: [{ waybill }]
      }
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        waybill,
        message: 'Shipment cancelled successfully'
      };
    }

    throw new Error(response.data?.message || 'Failed to cancel shipment');
  } catch (error) {
    console.error('❌ Delhivery shipment cancellation failed:', error.message);
    throw new Error(`Failed to cancel shipment: ${error.message}`);
  }
};

export default {
  checkDeliveryAvailability,
  calculateDeliveryCharges,
  createShipment,
  getShipmentTracking,
  cancelShipment
};
