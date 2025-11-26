# Supabase Storage Setup for Scan Images

This guide walks you through setting up Supabase Storage to store equipment scan images.

## Setup Steps

### 1. Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Fill in the details:
   - **Name**: `scan-images`
   - **Public bucket**: ✅ Enable (images need to be publicly accessible)
   - **File size limit**: 10 MB (or adjust based on your needs)
   - **Allowed MIME types**: Leave empty or specify:
     - `image/jpeg`
     - `image/jpg`
     - `image/png`
     - `image/webp`
     - `image/heic`
     - `image/heif`

5. Click **Create bucket**

### 2. Configure Storage Policies

After creating the bucket, set up Row Level Security (RLS) policies:

#### Allow Authenticated Users to Upload

```sql
-- Policy: Allow authenticated users to upload their own images
CREATE POLICY "Users can upload their own scan images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

#### Allow Public Read Access

```sql
-- Policy: Allow public read access to all scan images
CREATE POLICY "Public read access for scan images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'scan-images');
```

#### Allow Users to Delete Their Own Images

```sql
-- Policy: Users can delete their own images
CREATE POLICY "Users can delete their own scan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. Verify Setup

Test the storage setup by:

1. Upload a test image through your app
2. Check that the image appears in the Storage browser
3. Verify the image is accessible via the public URL
4. Try deleting a scan and confirm the image is removed

## File Organization

Images are organized by user ID:

```
scan-images/
├── user-id-1/
│   ├── 1701234567890-abc123def456.jpg
│   ├── 1701234567891-xyz789ghi012.jpg
│   └── ...
├── user-id-2/
│   ├── 1701234567892-jkl345mno678.jpg
│   └── ...
└── ...
```

**File naming pattern:**
- `{userId}/{timestamp}-{randomString}.{extension}`
- Example: `550e8400-e29b-41d4-a716-446655440000/1701234567890-abc123def456.jpg`

## Storage Quotas

### Supabase Free Tier:
- **Storage**: 1 GB
- **Bandwidth**: 2 GB/month
- **Estimated capacity**: ~5,000-10,000 images (depending on size)

### Recommendations:
1. **Image compression**: Consider compressing images before upload
2. **Monitor usage**: Check Storage usage in Supabase dashboard regularly
3. **Cleanup**: Implement automatic cleanup for old/unused images
4. **Upgrade**: Consider upgrading to Pro tier if you exceed free limits

## Environment Variables

No additional environment variables needed! The storage service uses your existing Supabase client configuration from `config/supabase.js`.

## API Usage

### Upload Image

```javascript
import { uploadScanImage } from './services/storageService.js'

const imageBuffer = fs.readFileSync('path/to/image.jpg')
const userId = 'user-uuid-here'
const mimeType = 'image/jpeg'

const imageUrl = await uploadScanImage(imageBuffer, userId, mimeType)
console.log('Image URL:', imageUrl)
```

### Delete Image

```javascript
import { deleteScanImage } from './services/storageService.js'

const imageUrl = 'https://your-project.supabase.co/storage/v1/object/public/scan-images/...'
await deleteScanImage(imageUrl)
```

### Delete All User Images

```javascript
import { deleteAllUserScanImages } from './services/storageService.js'

const userId = 'user-uuid-here'
await deleteAllUserScanImages(userId)
```

## Automatic Image Cleanup

Images are automatically deleted when:

1. **Individual scan deleted**: `deleteScan()` removes the associated image
2. **Clear all history**: `clearUserScanHistory()` removes all user images
3. **Manual deletion**: Use `deleteScanImage()` or `deleteAllUserScanImages()`

## Troubleshooting

### Issue: "Bucket not found" error

**Solution**: Ensure the bucket name in `storageService.js` matches exactly:
```javascript
const SCAN_IMAGES_BUCKET = 'scan-images' // Must match bucket name in Supabase
```

### Issue: Upload fails with permission error

**Solution**:
1. Check RLS policies are correctly set up
2. Ensure user is authenticated
3. Verify bucket is public
4. Check file size doesn't exceed limits

### Issue: Images not visible after upload

**Solution**:
1. Verify bucket is set to **public**
2. Check public read policy exists
3. Test public URL directly in browser

### Issue: Running out of storage

**Solutions**:
1. Implement image compression before upload
2. Set up automatic cleanup of old images
3. Consider upgrading to Supabase Pro
4. Use lower resolution for stored images

## Image Formats Supported

The storage service supports the following image formats:
- JPEG/JPG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- WebP (`.webp`)
- GIF (`.gif`)
- HEIC (`.heic`)
- HEIF (`.heif`)

## Security Considerations

1. **User isolation**: Images are stored in user-specific folders
2. **Public URLs**: Images are publicly accessible (by design)
3. **File validation**: MIME types are validated during upload
4. **Size limits**: Enforced at bucket level
5. **Deletion protection**: Users can only delete their own images

## Migration from Existing System

If you have existing scans without images:

1. They will continue to work with `image_url: null`
2. New scans will include images
3. No data migration needed
4. Gradually all scans will have images as users create new ones

## Next Steps

After setup:

1. ✅ Create `scan-images` bucket in Supabase
2. ✅ Set up RLS policies
3. ✅ Test image upload
4. ✅ Verify images appear in scan history
5. ✅ Test image deletion
6. 📊 Monitor storage usage
