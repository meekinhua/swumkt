import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Star, User } from 'lucide-react';

const UserTypeBadge = ({ userType, size = 'md', showLabel = true }) => {
  const { t } = useTranslation();

  const badgeConfig = {
    trust: {
      icon: Star,
      label: t('userType.trust', 'Trust User'),
      bgColor: 'bg-gradient-to-r from-yellow-400 to-amber-500',
      textColor: 'text-white',
      borderColor: 'border-yellow-500'
    },
    admin: {
      icon: Shield,
      label: t('userType.admin', 'Admin'),
      bgColor: 'bg-gradient-to-r from-purple-500 to-indigo-600',
      textColor: 'text-white',
      borderColor: 'border-purple-500'
    },
    regular: {
      icon: User,
      label: t('userType.regular', 'Regular User'),
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-300'
    }
  };

  const config = badgeConfig[userType] || badgeConfig.regular;
  const Icon = config.icon;

  const sizeClasses = {
    sm: {
      icon: 'w-3 h-3',
      text: 'text-xs',
      padding: 'px-2 py-0.5',
      gap: 'gap-1'
    },
    md: {
      icon: 'w-4 h-4',
      text: 'text-sm',
      padding: 'px-3 py-1',
      gap: 'gap-1.5'
    },
    lg: {
      icon: 'w-5 h-5',
      text: 'text-base',
      padding: 'px-4 py-1.5',
      gap: 'gap-2'
    }
  };

  const sizes = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`inline-flex items-center ${sizes.gap} ${sizes.padding} ${config.bgColor} ${config.textColor} rounded-full border-2 ${config.borderColor} font-semibold shadow-sm`}
    >
      <Icon className={sizes.icon} />
      {showLabel && <span className={sizes.text}>{config.label}</span>}
    </div>
  );
};

export default UserTypeBadge;
