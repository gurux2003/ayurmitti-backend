import axios from 'axios';

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || 'https://staging-express.delhivery.com';
const DELHIVERY_API_KEY = process.env.DELHIVERY_API_KEY;

if (!DELHIVERY_API_KEY) {
  console.warn('⚠️ DELHIVERY_API_KEY is not set. Delivery features will not work.');
}

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

export const checkDeliveryAvailability = async (pincode) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const isStaging = DELHIVERY_BASE_URL.includes('staging');

    if (isStaging) {
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

export const calculateDeliveryCharges = async ({ weight, pincode, origin_pincode = '302001' }) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const WEIGHT_SLAB = weight <= 0.5 ? 'light' : weight <= 2 ? 'medium' : 'heavy';

    const chargesMap = {
      light: { local: 30, metro: 40, national: 80 },
      medium: { local: 50, metro: 70, national: 120 },
      heavy: { local: 80, metro: 110, national: 180 }
    };

    let zone = 'national';
    const metroPin = ['400', '110', '201', '302'];
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

export const createShipment = async (shipmentData) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const requiredFields = ['order_id', 'customer_name', 'customer_phone', 'destination_pincode', 'destination_address'];
    for (const field of requiredFields) {
      if (!shipmentData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const client = getDelhiveryClient();

    // Delhivery expects form-encoded data for shipment creation
    const shipmentPayload = JSON.stringify({
      shipments: [
        {
          name: shipmentData.customer_name,
          add: shipmentData.destination_address,
          pin: shipmentData.destination_pincode,
          city: shipmentData.destination_city || '',
          state: shipmentData.destination_state || '',
          country: 'India',
          phone: shipmentData.customer_phone,
          order: shipmentData.order_id,
          payment_mode: shipmentData.payment_mode || 'Prepaid',
          return_pin: '',
          return_city: '',
          return_phone: '',
          return_add: '',
          return_state: '',
          return_country: 'India',
          products_desc: shipmentData.product_description || 'Ayurvedic Products',
          hsn_code: '',
          cod_amount: shipmentData.payment_mode === 'COD' ? String(shipmentData.total_amount) : '0',
          order_date: new Date().toISOString().split('T')[0],
          total_amount: String(shipmentData.total_amount || 0),
          seller_add: '',
          seller_name: 'Ayurmitti',
          seller_inv: '',
          quantity: '1',
          waybill: '',
          shipment_width: '10',
          shipment_height: '10',
          weight: String((shipmentData.weight || 0.5) * 1000), // grams
          seller_gst_tin: '',
          shipping_mode: 'Surface',
          address_type: 'home'
        }
      ],
      pickup_location: {
        name: 'Ayurmitti'
      }
    });

    const formData = `format=json&data=${encodeURIComponent(shipmentPayload)}`;

    console.log('🚚 DELHIVERY SHIPMENT PAYLOAD:', shipmentPayload);

    const response = await client.post('/api/cmu/create.json', formData, {
      headers: {
        'Authorization': `Token ${DELHIVERY_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('🔍 DELHIVERY RAW RESPONSE:', JSON.stringify(response.data, null, 2));

    // Handle response — Delhivery returns packages array
    const packages = response.data?.packages;
    if (packages && packages.length > 0) {
      const pkg = packages[0];
      return {
        success: true,
        shipment_id: pkg.refnum || '',
        waybill: pkg.waybill || '',
        status: pkg.status || 'created',
        order_id: shipmentData.order_id,
        tracking_url: `https://track.delhivery.com/${pkg.waybill}`
      };
    }

    // Some responses return cash_pickups or other formats
    if (response.data) {
      console.log('⚠️ Unexpected response structure:', JSON.stringify(response.data));
      return {
        success: false,
        raw: response.data,
        message: 'Unexpected response from Delhivery — check Railway logs'
      };
    }

    throw new Error('Failed to create shipment - no response data');
  } catch (error) {
    console.error('❌ Delhivery shipment creation failed:', error.message);
    if (error.response) {
      console.error('❌ Delhivery error response:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to create shipment: ${error.message}`);
  }
};

export const getShipmentTracking = async (waybill) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const client = getDelhiveryClient();
    const response = await client.get(`/api/v1/packages/json/?waybill=${waybill}`);

    console.log('🔍 DELHIVERY TRACKING RESPONSE:', JSON.stringify(response.data, null, 2));

    if (response.data?.ShipmentData?.length > 0) {
      const tracking = response.data.ShipmentData[0].Shipment;
      return {
        success: true,
        waybill,
        status: tracking.Status?.Status || 'In Transit',
        last_update: tracking.Status?.StatusDateTime || new Date().toISOString(),
        location: tracking.Status?.StatusLocation || 'In Transit',
        attempts: tracking.Attempts || 0
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

export const cancelShipment = async (waybill) => {
  try {
    if (!DELHIVERY_API_KEY) {
      throw new Error('Delhivery API key not configured');
    }

    const client = getDelhiveryClient();
    const response = await client.post('/api/p/edit', 
      `waybill=${waybill}&cancellation=true`,
      {
        headers: {
          'Authorization': `Token ${DELHIVERY_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('🔍 DELHIVERY CANCEL RESPONSE:', JSON.stringify(response.data, null, 2));

    if (response.data?.status === true) {
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
