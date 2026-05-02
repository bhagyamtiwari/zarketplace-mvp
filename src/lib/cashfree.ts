export const loadCashfree = async () => {
  if (typeof (window as any).Cashfree === 'undefined') {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.onload = () => {
        const cashfree = (window as any).Cashfree({
          mode: import.meta.env.VITE_CASHFREE_ENV || 'sandbox',
        });
        resolve(cashfree);
      };
      document.body.appendChild(script);
    });
  } else {
    return (window as any).Cashfree({
      mode: import.meta.env.VITE_CASHFREE_ENV || 'sandbox',
    });
  }
};

export const handleCashfreePayment = async (paymentSessionId: string) => {
  const cashfree = await loadCashfree();
  const checkoutOptions = {
    paymentSessionId: paymentSessionId,
    redirectTarget: "_modal", // or "_self"
  };
  return cashfree.checkout(checkoutOptions);
};
