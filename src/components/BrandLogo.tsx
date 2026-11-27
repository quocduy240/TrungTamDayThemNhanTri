import React from 'react';

export const BRAND_LOGO_URL = '/assets/aistudio/IMG_9576_37a847ca.JPG';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  alt?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

/**
 * Official circular Nhân Trí emblem with object-contain framing so the
 * sweeping crimson T stroke extending past the double blue rim is never cropped.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  alt = 'Logo Trung Tâm Nhân Trí - Since 2023',
}) => {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-white border border-blue-200/90 shadow-xs p-0.5 shrink-0 overflow-hidden select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={BRAND_LOGO_URL}
        alt={alt}
        className="w-full h-full object-contain rounded-full"
        draggable={false}
      />
    </span>
  );
};
