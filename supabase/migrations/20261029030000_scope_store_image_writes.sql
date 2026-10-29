DROP POLICY IF EXISTS anon_insert_product_images ON storage.objects;
DROP POLICY IF EXISTS anon_update_product_images ON storage.objects;
DROP POLICY IF EXISTS anon_delete_product_images ON storage.objects;

DROP POLICY IF EXISTS store_owner_select_product_images ON storage.objects;
CREATE POLICY store_owner_select_product_images
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
  );

DROP POLICY IF EXISTS store_owner_insert_product_images ON storage.objects;
CREATE POLICY store_owner_insert_product_images
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
  );

DROP POLICY IF EXISTS store_owner_update_product_images ON storage.objects;
CREATE POLICY store_owner_update_product_images
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
  );

DROP POLICY IF EXISTS store_owner_delete_product_images ON storage.objects;
CREATE POLICY store_owner_delete_product_images
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
  );
