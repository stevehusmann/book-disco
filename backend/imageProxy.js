const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const isPrivateIpv4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 168 || (second === 0 && octets[2] === 0)))
    || (first === 198 && (second === 18 || second === 19));
};

const isPublicAddress = (address) => {
  const version = net.isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice(7);
    return net.isIP(mappedIpv4) === 4 && !isPrivateIpv4(mappedIpv4);
  }
  return normalized !== '::'
    && normalized !== '::1'
    && !normalized.startsWith('fc')
    && !normalized.startsWith('fd')
    && !normalized.startsWith('fe8')
    && !normalized.startsWith('fe9')
    && !normalized.startsWith('fea')
    && !normalized.startsWith('feb');
};

const validatePublicImageUrl = async (value) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP or HTTPS image URLs are supported.');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Image URLs on custom ports are not supported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local image hosts are not supported.');
  }
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Image host must resolve only to public addresses.');
  }
  return url;
};

const createImageProxyHandler = async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl || rawUrl.length > 2048) {
    res.status(400).json({ error: 'A valid image URL is required.' });
    return;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 15000);
  try {
    let url = await validatePublicImageUrl(rawUrl);
    let response;
    for (let redirects = 0; ; redirects += 1) {
      response = await fetch(url, {
        redirect: 'manual',
        signal: abortController.signal,
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' }
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirects >= MAX_REDIRECTS) throw new Error('The image URL redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The image URL returned an invalid redirect.');
      url = await validatePublicImageUrl(new URL(location, url).toString());
    }

    if (!response.ok) {
      res.status(502).json({ error: `Image host returned status ${response.status}.` });
      return;
    }
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'The URL did not return an image.' });
      return;
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Image exceeds the 12 MB limit.' });
      return;
    }
    const chunks = [];
    let receivedBytes = 0;
    for await (const chunk of response.body) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_IMAGE_BYTES) {
        abortController.abort();
        res.status(413).json({ error: 'Image exceeds the 12 MB limit.' });
        return;
      }
      chunks.push(chunk);
    }
    const image = Buffer.concat(chunks, receivedBytes);
    res.set('Content-Type', contentType);
    res.set('Content-Length', String(image.length));
    res.set('Cache-Control', 'public, max-age=300');
    res.send(image);
  } catch (error) {
    if (abortController.signal.aborted) {
      res.status(504).json({ error: 'Image request timed out.' });
    } else if (/Only public|Local image|custom ports|resolve only/.test(error.message)) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(502).json({ error: error.message || 'Could not load image URL.' });
    }
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { createImageProxyHandler };
